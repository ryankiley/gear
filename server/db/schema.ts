// Drizzle schema. Works on PGlite (local dev) and Neon (prod) — driver-agnostic.
//
// Design: a list's CONTENT (folders + items) lives in a single JSONB `data`
// column, and the same op-reducer (shared/ops.ts) applies mutations on both the
// client (optimistic) and the server (authoritative) — so they can't drift.
// Weight rollups are cached as columns for the public-feed leaderboard sort.
// We never query items relationally in v1 (the catalog is a separate Phase-2
// table), so JSONB is the right fit and keeps sync semantics in one place.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ListData } from "../../shared/types";

export const lists = pgTable(
  "lists",
  {
    // internal id — NEVER exposed in a URL or API response
    id: serial("id").primaryKey(),
    publicSlug: text("public_slug").notNull(),
    // sha256(editToken) hex — the write capability; raw token never stored
    editTokenHash: text("edit_token_hash").notNull(),
    // short Crockford base32 read capability (the /s/ link)
    shareCode: text("share_code").notNull(),
    title: text("title").notNull().default("Untitled list"),
    description: text("description"),
    displayUnit: text("display_unit").notNull().default("g"),
    // folders + items (the op-reducer's state)
    data: jsonb("data").$type<ListData>().notNull(),
    // cached rollups (feed sort only; recomputed on every write)
    baseWeightMg: bigint("base_weight_mg", { mode: "number" }).notNull().default(0),
    wornWeightMg: bigint("worn_weight_mg", { mode: "number" }).notNull().default(0),
    consumableWeightMg: bigint("consumable_weight_mg", { mode: "number" }).notNull().default(0),
    totalWeightMg: bigint("total_weight_mg", { mode: "number" }).notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    isPublic: boolean("is_public").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    season: text("season"),
    primaryCategory: text("primary_category"),
    // optional recovery (generated phrase only); not used yet
    claimPhraseHash: text("claim_phrase_hash"),
    // optimistic concurrency + live-sync counter
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("active"), // active | hidden | removed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // partial unique indexes so soft-deleted rows don't block reuse
    uniqueIndex("idx_lists_edit_token")
      .on(t.editTokenHash)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex("idx_lists_share_code")
      .on(t.shareCode)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex("idx_lists_slug")
      .on(t.publicSlug)
      .where(sql`${t.deletedAt} is null`),
    index("idx_lists_feed")
      .on(t.baseWeightMg)
      .where(sql`${t.isPublic} and ${t.status} = 'active' and ${t.deletedAt} is null`),
  ],
);

export type ListRow = typeof lists.$inferSelect;
export type NewListRow = typeof lists.$inferInsert;

// ---------------------------------------------------------------------------
// catalog_items — the curated, *cited* gear-weight spine (Phase 2).
//
// Unlike a list's JSONB content, the catalog is queried RELATIONALLY (fuzzy
// autocomplete, usage ranking, wiki corrections), so it's a normalized table.
// Every seeded row carries a real citation (`source_url`) and a provenance
// (`weight_source`) — provenance is the product's trust moat, so it's required.
//
// Fuzzy search uses a pg_trgm GIN index. pg_trgm is available on Neon but NOT
// on local PGlite (its WASM build doesn't ship the extension unless loaded into
// the constructor, which we don't touch), so the trigram index is created at
// runtime ONLY on Neon by `ensureCatalogTrgm()` in server/utils/catalog.ts; the
// search endpoint falls back to ILIKE substring matching on PGlite. The GIN
// index is declared here too so the Drizzle schema / future migrations stay
// faithful — this declaration is metadata only and is never run by the raw-DDL
// `ensureSchema()` path that the live app uses.
// ---------------------------------------------------------------------------
export const catalogItems = pgTable(
  "catalog_items",
  {
    id: serial("id").primaryKey(),
    brand: text("brand"), // company / maker (nullable: generic items like "Smartwater bottle")
    name: text("name").notNull(), // product name
    variant: text("variant"), // size / temp / capacity that changes the weight
    description: text("description"),
    // shelter|sleep|pack|cook|water|clothing|electronics|firstaid|consumable|other
    categoryHint: text("category_hint"),
    weightMg: bigint("weight_mg", { mode: "number" }).notNull(),
    // REQUIRED provenance — forces every row to declare where its weight came from
    weightSource: text("weight_source").notNull(), // manufacturer|measured|community|imported
    sourceUrl: text("source_url"), // the citation (manufacturer spec page preferred)
    productUrl: text("product_url"), // optional buy/official link, distinct from the citation
    imageUrl: text("image_url"), // optional, external — we don't host images
    msrpCents: integer("msrp_cents"),
    currency: text("currency"),
    verified: boolean("verified").notNull().default(false), // owner-curated trust
    usageCount: integer("usage_count").notNull().default(0), // ranks autocomplete
    status: text("status").notNull().default("active"), // active|merged|removed
    mergedIntoId: integer("merged_into_id"), // when status='merged', the survivor row
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "catalog_weight_source_ck",
      sql`${t.weightSource} in ('manufacturer','measured','community','imported')`,
    ),
    check("catalog_status_ck", sql`${t.status} in ('active','merged','removed')`),
    // identity for idempotent upsert — coalesce so NULL brand/variant compare equal
    uniqueIndex("idx_catalog_identity").on(
      sql`coalesce(${t.brand},'')`,
      t.name,
      sql`coalesce(${t.variant},'')`,
    ),
    // autocomplete ranking: verified first, then most-used
    index("idx_catalog_rank")
      .on(t.verified.desc(), t.usageCount.desc())
      .where(sql`${t.status} = 'active'`),
    // fuzzy search (Neon only — see note above; created by ensureCatalogTrgm())
    index("idx_catalog_trgm").using(
      "gin",
      sql`(coalesce(${t.brand},'') || ' ' || ${t.name}) gin_trgm_ops`,
    ),
  ],
);

export type CatalogItemRow = typeof catalogItems.$inferSelect;
export type NewCatalogItemRow = typeof catalogItems.$inferInsert;

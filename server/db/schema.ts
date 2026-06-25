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

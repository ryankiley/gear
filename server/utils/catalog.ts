// Catalog (Phase 2) — schema bootstrap + fuzzy autocomplete search.
//
// Kept out of the hot lists path in db.ts on purpose. The catalog table DDL is
// single-sourced here (CATALOG_DDL) and spread into db.ts's idempotent local
// DDL, so the dev server auto-creates it; the seed script and search endpoint
// also call ensureCatalogSchema() so they work on Neon (where db.ts applies
// schema via migrations, not on the request path) regardless of migration state.
//
// FUZZY SEARCH — pg_trgm vs ILIKE/JS, decided empirically:
//   • Neon (prod): pg_trgm is available → a GIN trigram index + word_similarity
//     give typo-tolerant matching ("zpacks duplx" → Zpacks Duplex) in SQL.
//   • PGlite (local dev): `CREATE EXTENSION pg_trgm` FAILS ("extension not
//     available") because PGlite only exposes contrib extensions loaded into its
//     constructor, which we don't touch (it's the shared lists DB path). So we
//     load the (small, bounded) active catalog and rank it in JS with a trigram
//     coverage score — same typo tolerance, zero extension. The set of gear
//     people actually carry is small by design, so this stays cheap locally.
// Engine is detected via DATABASE_URL, the same signal db.ts uses.

import { eq, inArray, sql } from "drizzle-orm";
import { catalogItems } from "../db/schema";

const isNeon = () => Boolean(process.env.DATABASE_URL);

/** The text we fuzzy-match against: "brand name" (matches the GIN index expr). */
function searchText(brand: string | null, name: string): string {
  return `${brand ? brand + " " : ""}${name}`;
}

// Safe on BOTH PGlite and Neon. Single source of truth; also spread into db.ts's
// local idempotent DDL. The pg_trgm GIN index is created separately (Neon only).
export const CATALOG_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS catalog_items (
    id serial PRIMARY KEY,
    brand text,
    name text NOT NULL,
    variant text,
    description text,
    category_hint text,
    weight_mg bigint NOT NULL,
    weight_source text NOT NULL CHECK (weight_source IN ('manufacturer','measured','community','imported')),
    source_url text,
    product_url text,
    image_url text,
    msrp_cents integer,
    currency text,
    verified boolean NOT NULL DEFAULT false,
    usage_count integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','merged','removed')),
    merged_into_id integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // identity for idempotent upsert — coalesce so NULL brand/variant compare equal
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_identity ON catalog_items ((coalesce(brand,'')), name, (coalesce(variant,'')))`,
  // autocomplete ranking: verified first, then most-used
  `CREATE INDEX IF NOT EXISTS idx_catalog_rank ON catalog_items (verified DESC, usage_count DESC) WHERE status = 'active'`,
];

let _ensured: Promise<void> | undefined;

/** Idempotently create the catalog table + indexes (memoized per process). */
export function ensureCatalogSchema(db: unknown): Promise<void> {
  const d = db as { execute: (q: unknown) => Promise<unknown> };
  if (!_ensured) {
    _ensured = (async () => {
      for (const stmt of CATALOG_DDL) await d.execute(sql.raw(stmt));
      if (isNeon()) {
        // Neon ships pg_trgm — create the extension + GIN trigram index that
        // power fuzzy autocomplete. (No-op'd locally; see file header.)
        await d.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS pg_trgm`));
        await d.execute(
          sql.raw(
            `CREATE INDEX IF NOT EXISTS idx_catalog_trgm ON catalog_items USING gin ((coalesce(brand,'') || ' ' || name) gin_trgm_ops)`,
          ),
        );
      }
    })();
  }
  return _ensured;
}

/** Reset the ensure-memo — for tests that spin up fresh databases. */
export function _resetCatalogEnsured(): void {
  _ensured = undefined;
}

export interface CatalogSearchResult {
  id: number;
  brand: string | null;
  name: string;
  variant: string | null;
  weightMg: number;
  weightSource: string;
  verified: boolean;
}

// --- trigram fuzzy scoring (the local PGlite fallback; pure + unit-tested) ---

/** pg_trgm-style trigrams: lowercase, non-alphanumerics→space, each word padded. */
export function trigrams(input: string): Set<string> {
  const cleaned = input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const out = new Set<string>();
  if (!cleaned) return out;
  for (const word of cleaned.split(/\s+/)) {
    const padded = `  ${word} `; // 2 leading + 1 trailing, like pg_trgm
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/**
 * How well `query` is covered by `target` (≈ pg_trgm word_similarity intent):
 * |T(query) ∩ T(target)| / |T(query)|. Rewards a short fragment/typo that's a
 * substring-ish of a longer name ("duplx" → "zpacks duplex" ≈ 0.67).
 */
export function trigramScore(query: string, target: string): number {
  const q = trigrams(query);
  if (q.size === 0) return 0;
  const t = trigrams(target);
  let hits = 0;
  for (const g of q) if (t.has(g)) hits++;
  return hits / q.size;
}

const SIM_THRESHOLD = 0.3; // matches pg_trgm's default similarity threshold

function normalizeQuery(q: unknown): string {
  return typeof q === "string" ? q.trim() : "";
}

/**
 * Fuzzy autocomplete. Returns up to `limit` results ordered
 * `verified DESC, usage_count DESC, similarity DESC`, gated to relevant matches.
 * pg_trgm on Neon; JS trigram ranking on PGlite (see file header).
 */
export async function searchCatalog(
  db: unknown,
  rawQuery: unknown,
  limit = 8,
): Promise<CatalogSearchResult[]> {
  const q = normalizeQuery(rawQuery);
  if (q.length < 2) return []; // 1 char is too noisy for trigram autocomplete

  if (isNeon()) {
    const d = db as { execute: (query: unknown) => Promise<unknown> };
    // word_similarity (the `<%` operator) matches a short query against the best
    // extent of a longer name — the right metric for autocomplete fragments. The
    // gin_trgm_ops index supports `<%`. Values are bound params (injection-safe).
    const res = await d.execute(sql`
      select id, brand, name, variant, weight_mg, weight_source, verified
      from catalog_items
      where status = 'active'
        and ${q} <% (coalesce(brand,'') || ' ' || name)
      order by verified desc,
               usage_count desc,
               word_similarity(${q}, coalesce(brand,'') || ' ' || name) desc
      limit ${limit}
    `);
    return normalizeRows(res);
  }

  // PGlite: load the bounded active catalog and rank in JS.
  const d = db as unknown as {
    select: () => {
      from: (t: typeof catalogItems) => {
        where: (w: unknown) => Promise<Array<Record<string, unknown>>>;
      };
    };
  };
  const rows = await d
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.status, "active"));

  return (rows as unknown as Array<{
    id: number;
    brand: string | null;
    name: string;
    variant: string | null;
    weightMg: number;
    weightSource: string;
    verified: boolean;
    usageCount: number;
  }>)
    .map((r) => ({ row: r, score: trigramScore(q, searchText(r.brand, r.name)) }))
    .filter((r) => r.score >= SIM_THRESHOLD)
    .sort(
      (a, b) =>
        Number(b.row.verified) - Number(a.row.verified) ||
        b.row.usageCount - a.row.usageCount ||
        b.score - a.score,
    )
    .slice(0, limit)
    .map(({ row }) => ({
      id: row.id,
      brand: row.brand,
      name: row.name,
      variant: row.variant,
      weightMg: Number(row.weightMg),
      weightSource: row.weightSource,
      verified: Boolean(row.verified),
    }));
}

/**
 * Increment usage_count for catalog rows that were just added to a list. This is
 * what makes autocomplete self-improve: the gear people actually carry floats to
 * the top of the ranking. Best-effort + bounded; works on PGlite + Neon.
 */
export async function bumpUsage(db: unknown, ids: number[]): Promise<void> {
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
  if (!clean.length) return;
  const d = db as {
    update: (t: typeof catalogItems) => {
      set: (v: unknown) => { where: (w: unknown) => Promise<unknown> };
    };
  };
  await d
    .update(catalogItems)
    .set({ usageCount: sql`usage_count + 1`, updatedAt: new Date() })
    .where(inArray(catalogItems.id, clean));
}

/** Normalize the row shape across drivers (neon-http vs pglite execute()). */
function normalizeRows(res: unknown): CatalogSearchResult[] {
  const rows = (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows) ?? [];
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    brand: (r.brand as string | null) ?? null,
    name: String(r.name),
    variant: (r.variant as string | null) ?? null,
    weightMg: Number(r.weight_mg),
    weightSource: String(r.weight_source),
    verified: Boolean(r.verified),
  }));
}

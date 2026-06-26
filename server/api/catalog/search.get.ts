import { defineEventHandler, getQuery, setHeader } from "h3";
import { ensureCatalogSchema, searchCatalog } from "../../utils/catalog";
import { useDb } from "../../utils/db";

// Maps-grade autocomplete for the gear catalog. `?q=` returns up to 8 fuzzy
// matches ordered `verified DESC, usage_count DESC, similarity DESC`. Fuzzy via
// pg_trgm on Neon, JS trigram ranking on PGlite (see server/utils/catalog.ts).
//
// Public read-only endpoint. The client debounces; we add a short edge cache so
// repeated keystrokes for the same prefix collapse to one DB hit. noindex — this
// is an API surface, not a page.
export default defineEventHandler(async (event) => {
  setHeader(event, "X-Robots-Tag", "noindex");
  setHeader(event, "Cache-Control", "public, max-age=2, s-maxage=10");

  const raw = getQuery(event).q;
  const q = (Array.isArray(raw) ? raw[0] : raw ?? "").toString().slice(0, 100);

  const db = await useDb();
  await ensureCatalogSchema(db);
  const results = await searchCatalog(db, q, 8);

  return { results };
});

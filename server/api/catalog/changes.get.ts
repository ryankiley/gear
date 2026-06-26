import { defineEventHandler, getQuery, setHeader } from "h3";
import { ensureCatalogSchema, recentChanges } from "../../utils/catalog";
import { useDb } from "../../utils/db";

// Recent catalog weight changes (the transparency / patrol feed). Public, read-only.
export default defineEventHandler(async (event) => {
  setHeader(event, "X-Robots-Tag", "noindex");
  setHeader(event, "Cache-Control", "public, max-age=30");
  const q = getQuery(event);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
  const db = await useDb();
  await ensureCatalogSchema(db);
  return { changes: await recentChanges(db, limit) };
});

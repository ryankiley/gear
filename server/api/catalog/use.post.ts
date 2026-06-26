import { defineEventHandler, readBody, setHeader } from "h3";
import { bumpUsage, ensureCatalogSchema } from "../../utils/catalog";
import { useDb } from "../../utils/db";
import { assertMaxBody, rateLimit } from "../../utils/rateLimit";

// Bump usage_count when catalog items are added to a list, so autocomplete
// ranking improves with real use. Best-effort, rate-limited, ids capped.
export default defineEventHandler(async (event) => {
  setHeader(event, "X-Robots-Tag", "noindex");
  assertMaxBody(event, 8_000);
  rateLimit(event, "catalog-use", 120, 60_000);
  const body = (await readBody(event).catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((n): n is number => typeof n === "number")
    : [];
  if (!ids.length) return { ok: true };
  const db = await useDb();
  await ensureCatalogSchema(db);
  await bumpUsage(db, ids);
  return { ok: true };
});

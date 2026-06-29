import { createError, defineEventHandler, setHeader } from "h3";
import { eq } from "drizzle-orm";
import { ensureCatalogSchema } from "../../utils/catalog";
import { catalogItems } from "../../db/schema";
import { useDb } from "../../utils/db";
import { rateLimit } from "../../utils/rateLimit";

// Full active-catalog snapshot for OFFLINE search. The client caches this in
// IndexedDB and searches it locally when the network is down.
//
// GATED behind the offline flag: the catalog is the product's moat, and a full
// dump is far easier to scrape than the throttled per-query search endpoint, so
// this stays a 404 until we actually ship the offline feature (NUXT_PUBLIC_OFFLINE).
// `version` is max(updated_at) as epoch-ms — the client re-fetches only when it
// changes, so the dump is downloaded rarely.
export default defineEventHandler(async (event) => {
  if (!useRuntimeConfig(event).public.offline) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  await rateLimit(event, "catalog-dump", 30, 60_000);
  setHeader(event, "X-Robots-Tag", "noindex");
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=3600");

  const db = await useDb();
  await ensureCatalogSchema(db);

  const rows = await db
    .select({
      id: catalogItems.id,
      brand: catalogItems.brand,
      name: catalogItems.name,
      variant: catalogItems.variant,
      weightMg: catalogItems.weightMg,
      weightSource: catalogItems.weightSource,
      verified: catalogItems.verified,
      usageCount: catalogItems.usageCount,
      updatedAt: catalogItems.updatedAt,
    })
    .from(catalogItems)
    .where(eq(catalogItems.status, "active"));

  let maxTs = 0;
  const items = rows.map((r) => {
    const ts = r.updatedAt ? +new Date(r.updatedAt as unknown as string) : 0;
    if (ts > maxTs) maxTs = ts;
    return {
      id: r.id,
      brand: r.brand,
      name: r.name,
      variant: r.variant,
      weightMg: Number(r.weightMg),
      weightSource: r.weightSource,
      verified: Boolean(r.verified),
      usageCount: r.usageCount,
    };
  });

  return { version: String(maxTs), items };
});

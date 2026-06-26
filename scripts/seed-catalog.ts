// Idempotent catalog seeder. Reads the curated, cited seed/catalog.csv and
// upserts each row into catalog_items, matching on (brand, name, variant) so
// re-running never duplicates — it inserts new rows and updates changed
// weights/sources in place. Seeded rows are owner-curated + cited, so they're
// marked verified=true.
//
// Run under Node 24 (the repo's pinned toolchain) via the `seed` npm script,
// which uses jiti (ships with Nuxt) to resolve the project's TS imports:
//   npm run seed
//
// Honors DATABASE_URL: writes to Neon when set, else local PGlite (.data/pglite).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { catalogItems } from "../server/db/schema";
import { ensureCatalogSchema } from "../server/utils/catalog";
import { useDb } from "../server/utils/db";
import { csvToCatalogRows } from "./catalogCsv";

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = join(here, "..", "seed", "catalog.csv");

async function main() {
  const csv = readFileSync(csvPath, "utf8");
  const rows = csvToCatalogRows(csv);
  console.log(`Loaded ${rows.length} rows from seed/catalog.csv`);

  const db = await useDb();
  await ensureCatalogSchema(db);

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of rows) {
    const brandCond = row.brand === null
      ? isNull(catalogItems.brand)
      : eq(catalogItems.brand, row.brand);
    const variantCond = row.variant === null
      ? isNull(catalogItems.variant)
      : eq(catalogItems.variant, row.variant);

    const existing = await db
      .select()
      .from(catalogItems)
      .where(and(brandCond, eq(catalogItems.name, row.name), variantCond))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(catalogItems).values({
        brand: row.brand,
        name: row.name,
        variant: row.variant,
        categoryHint: row.categoryHint,
        weightMg: row.weightMg,
        weightSource: row.weightSource,
        sourceUrl: row.sourceUrl,
        verified: true, // seeded = owner-curated + cited
      });
      inserted++;
      continue;
    }

    const cur = existing[0];
    const changed =
      Number(cur.weightMg) !== row.weightMg ||
      cur.weightSource !== row.weightSource ||
      cur.sourceUrl !== row.sourceUrl ||
      cur.categoryHint !== row.categoryHint ||
      cur.verified !== true;

    if (changed) {
      await db
        .update(catalogItems)
        .set({
          weightMg: row.weightMg,
          weightSource: row.weightSource,
          sourceUrl: row.sourceUrl,
          categoryHint: row.categoryHint,
          verified: true,
          updatedAt: new Date(),
        })
        .where(eq(catalogItems.id, cur.id));
      updated++;
    } else {
      unchanged++;
    }
  }

  // Final count straight from the table.
  const all = await db.select({ id: catalogItems.id }).from(catalogItems);
  console.log(
    `Catalog seeded: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged.`,
  );
  console.log(`catalog_items now holds ${all.length} rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });

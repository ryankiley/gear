import { describe, expect, it } from "vitest";
import {
  searchCatalogLocal,
  trigramScore,
  trigrams,
  type LocalCatalogRow,
} from "../shared/catalogSearch";

// These mirror tests/catalog.test.ts so the extraction to shared/ is provably
// behaviour-preserving (the server re-exports these same functions).
describe("trigrams", () => {
  it("pads each word like pg_trgm (2 leading, 1 trailing)", () => {
    expect(trigrams("cat")).toEqual(new Set(["  c", " ca", "cat", "at "]));
  });
  it("is empty for whitespace/punctuation only", () => {
    expect(trigrams("  -- ").size).toBe(0);
  });
});

describe("trigramScore", () => {
  it("scores a full match 1", () => {
    expect(trigramScore("duplex", "Zpacks Duplex")).toBe(1);
  });
  it("tolerates a typo (a dropped letter still ranks high)", () => {
    expect(trigramScore("duplx", "Zpacks Duplex")).toBeGreaterThan(0.5);
  });
  it("scores an unrelated target low", () => {
    expect(trigramScore("duplx", "MSR PocketRocket 2")).toBeLessThan(0.2);
  });
});

const row = (over: Partial<LocalCatalogRow>): LocalCatalogRow => ({
  id: 1,
  brand: "Zpacks",
  name: "Duplex",
  variant: null,
  weightMg: 549981,
  weightSource: "manufacturer",
  verified: true,
  usageCount: 0,
  ...over,
});

describe("searchCatalogLocal", () => {
  it("returns nothing for a query under 2 chars", () => {
    expect(searchCatalogLocal([row({})], "d")).toEqual([]);
  });

  it("filters out rows below the similarity threshold", () => {
    const rows = [row({ id: 1, brand: "Zpacks", name: "Duplex" }), row({ id: 2, brand: "MSR", name: "PocketRocket" })];
    const out = searchCatalogLocal(rows, "duplex");
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it("ranks verified before unverified, then by usage_count", () => {
    const rows = [
      row({ id: 1, name: "Duplex", verified: false, usageCount: 100 }),
      row({ id: 2, name: "Duplex", verified: true, usageCount: 1 }),
      row({ id: 3, name: "Duplex", verified: true, usageCount: 50 }),
    ];
    const out = searchCatalogLocal(rows, "duplex");
    expect(out.map((r) => r.id)).toEqual([3, 2, 1]); // verified(usage50), verified(usage1), unverified
  });

  it("caps results at the limit", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ id: i + 1, name: "Duplex" }));
    expect(searchCatalogLocal(rows, "duplex", 8)).toHaveLength(8);
  });

  it("returns the autocomplete shape (no usageCount; weightMg numeric)", () => {
    const [r] = searchCatalogLocal([row({ weightMg: 549981 })], "duplex");
    expect(r).toEqual({
      id: 1,
      brand: "Zpacks",
      name: "Duplex",
      variant: null,
      weightMg: 549981,
      weightSource: "manufacturer",
      verified: true,
    });
    expect("usageCount" in (r as object)).toBe(false);
  });
});

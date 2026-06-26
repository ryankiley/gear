import { describe, expect, it } from "vitest";
import { MG_PER_UNIT } from "../shared/weights";
import {
  csvToCatalogRows,
  parseCsv,
  serializeCsv,
  specToMg,
} from "../scripts/catalogCsv";
import { trigramScore, trigrams } from "../server/utils/catalog";

describe("specToMg — cited spec → integer milligrams", () => {
  it("converts a simple oz spec (Zpacks Duplex: 19.4 oz)", () => {
    expect(specToMg(19.4, "oz")).toBe(Math.round(19.4 * MG_PER_UNIT.oz));
  });
  it("keeps grams exact (550 g)", () => {
    expect(specToMg(550, "g")).toBe(550_000);
  });
  it("converts kg (Durston X-Dome 2: 1.26 kg)", () => {
    expect(specToMg(1.26, "kg")).toBe(1_260_000);
  });
  it("handles compound lb+oz (WM UltraLite: 1 lb 13 oz)", () => {
    const expected = Math.round(1 * MG_PER_UNIT.lb + 13 * MG_PER_UNIT.oz);
    expect(specToMg(1, "lb", "13 oz")).toBe(expected);
  });
  it("treats '0 oz' secondary as just the primary (2 lb)", () => {
    expect(specToMg(2, "lb", "0 oz")).toBe(Math.round(2 * MG_PER_UNIT.lb));
  });
  it("ignores a REDUNDANT equivalent secondary (same mass restated), not adding it", () => {
    // "29.7 oz / 841.7 g" — secondary g equals the primary oz, must NOT double
    expect(specToMg(29.7, "oz", "841.7 g")).toBe(Math.round(29.7 * MG_PER_UNIT.oz));
    // "4.613 lb / 2.092 kg" — secondary is a LARGER unit, can't be additive
    expect(specToMg(4.613, "lb", "2.092 kg")).toBe(Math.round(4.613 * MG_PER_UNIT.lb));
    // coarsely-rounded equivalent "2 oz / 0.06 kg"
    expect(specToMg(2, "oz", "0.06 kg")).toBe(Math.round(2 * MG_PER_UNIT.oz));
    // messy multi-figure restatement "2 lb 1 oz | 940 g" — >1 number ⇒ ignored
    expect(specToMg(2.1, "lb", "2 lb 1 oz | 940 g")).toBe(Math.round(2.1 * MG_PER_UNIT.lb));
    // a g-equivalent after an oz primary ("1 lb 2 oz" worth restated) stays single
    expect(specToMg(512, "g", "1 lb 2 oz")).toBe(512_000);
  });
  it("still adds a genuine additive remainder near the primary (1 lb 15 oz)", () => {
    expect(specToMg(1, "lb", "15 oz")).toBe(
      Math.round(1 * MG_PER_UNIT.lb + 15 * MG_PER_UNIT.oz),
    );
  });
  it("throws on a bad unit or value", () => {
    expect(() => specToMg(5, "stone" as never)).toThrow();
    expect(() => specToMg(NaN, "g")).toThrow();
  });
});

describe("parseCsv — hand-rolled RFC4180-ish", () => {
  it("parses a simple grid", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("handles quoted fields with embedded commas", () => {
    expect(parseCsv('name,note\n"Duplex, DCF",light\n')).toEqual([
      ["name", "note"],
      ["Duplex, DCF", "light"],
    ]);
  });
  it("handles escaped double-quotes", () => {
    expect(parseCsv('a\n"he said ""hi"""\n')).toEqual([["a"], ['he said "hi"']]);
  });
  it("handles CRLF and a missing trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("preserves commas/newlines inside quotes", () => {
    expect(parseCsv('x\n"line1\nline2"\n')).toEqual([["x"], ["line1\nline2"]]);
  });
});

describe("serializeCsv + csvToCatalogRows round-trip", () => {
  const csv = serializeCsv(
    ["brand", "name", "variant", "category_hint", "weight_mg", "weight_source", "source_url"],
    [
      {
        brand: "Zpacks",
        name: "Duplex",
        variant: "",
        category_hint: "shelter",
        weight_mg: 549981,
        weight_source: "manufacturer",
        source_url: "https://zpacks.com/products/duplex-tent",
      },
      {
        brand: "",
        name: "Smartwater bottle, 1L",
        variant: "1L",
        category_hint: "water",
        weight_mg: 39000,
        weight_source: "measured",
        source_url: "https://example.com/spec",
      },
    ],
  );

  it("round-trips rows, mapping blank brand/variant to null", () => {
    const rows = csvToCatalogRows(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      brand: "Zpacks",
      name: "Duplex",
      variant: null,
      categoryHint: "shelter",
      weightMg: 549981,
      weightSource: "manufacturer",
    });
    // the comma in "Smartwater bottle, 1L" must survive quoting
    expect(rows[1].name).toBe("Smartwater bottle, 1L");
    expect(rows[1].brand).toBeNull();
  });

  it("rejects an invalid weight_source", () => {
    const bad = "brand,name,variant,category_hint,weight_mg,weight_source,source_url\nX,Y,,pack,100,guessed,https://x\n";
    expect(() => csvToCatalogRows(bad)).toThrow(/weight_source/);
  });

  it("rejects a non-positive weight_mg", () => {
    const bad = "brand,name,variant,category_hint,weight_mg,weight_source,source_url\nX,Y,,pack,0,manufacturer,https://x\n";
    expect(() => csvToCatalogRows(bad)).toThrow(/weight_mg/);
  });
});

describe("trigram fuzzy scoring (local PGlite search fallback)", () => {
  it("scores an exact word match as 1.0", () => {
    expect(trigramScore("duplex", "Zpacks Duplex")).toBe(1);
  });
  it("tolerates a typo: 'duplx' → 'Zpacks Duplex'", () => {
    expect(trigramScore("duplx", "Zpacks Duplex")).toBeGreaterThan(0.5);
  });
  it("scores unrelated text low", () => {
    expect(trigramScore("duplx", "MSR PocketRocket 2")).toBeLessThan(0.2);
  });
  it("is case- and punctuation-insensitive", () => {
    expect(trigramScore("neoair xlite", "Therm-a-Rest NeoAir XLite")).toBeGreaterThan(0.9);
  });
  it("produces padded trigrams per word", () => {
    expect(trigrams("cat")).toEqual(new Set(["  c", " ca", "cat", "at "]));
  });
});

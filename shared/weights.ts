// Weight math — the single source of truth for unit conversion and totals.
// All weights are stored as INTEGER MILLIGRAMS to avoid float drift across
// many items and oz<->g conversions. Display unit is presentation only.

import type {
  Classification,
  Folder,
  Item,
  ListData,
  Totals,
  Unit,
} from "./types";

/** Milligrams per one display unit. */
export const MG_PER_UNIT: Record<Unit, number> = {
  g: 1_000,
  kg: 1_000_000,
  oz: 28_349.523125,
  lb: 453_592.37,
};

/** A display value in `unit` -> integer milligrams. */
export function toMg(value: number, unit: Unit): number {
  return Math.round(value * MG_PER_UNIT[unit]);
}

/** Integer milligrams -> a (lossy) display value in `unit`. */
export function fromMg(mg: number, unit: Unit): number {
  return mg / MG_PER_UNIT[unit];
}

const UNIT_ALIASES: Record<string, Unit> = {
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kgs: "kg",
  kilogram: "kg",
  kilograms: "kg",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
};

/**
 * Parse messy human weight input into integer milligrams.
 * Handles "1.36kg", "48 oz", "2 lb 3 oz", "820g", "1,360 g".
 * A bare number with no unit uses `defaultUnit`. Returns null if nothing parses.
 */
export function parseWeightInput(
  raw: string,
  defaultUnit: Unit = "g",
): number | null {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase();
  if (!text) return null;

  // number, optionally followed by a unit word
  const re = /(-?[\d][\d,]*\.?\d*)\s*([a-z]+)?/g;
  let mg = 0;
  let matched = false;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(num)) continue;
    const unitWord = m[2];
    const unit = unitWord ? UNIT_ALIASES[unitWord] : defaultUnit;
    if (unitWord && !unit) continue; // an unknown word like "stuff sack" — skip
    matched = true;
    mg += num * MG_PER_UNIT[unit];
  }

  return matched ? Math.round(mg) : null;
}

/** An item's effective classification = its own, else its folder's default. */
export function effectiveClassification(
  item: Pick<Item, "classification" | "folderId">,
  folders: Folder[],
): Classification {
  if (item.classification) return item.classification;
  const folder = folders.find((f) => f.id === item.folderId);
  return folder?.defaultClassification ?? "base";
}

/** Line weight for an item (qty × unit weight), in milligrams. */
export function lineMg(item: Pick<Item, "qty" | "unitWeightMg">): number {
  return Math.max(0, item.qty) * Math.max(0, item.unitWeightMg);
}

/**
 * Compute the four rollups. base = total − worn − consumable.
 * The math keys off effective classification, never folder names, so lists
 * stay comparable no matter how each person folders.
 */
export function computeTotals(list: ListData): Totals {
  let totalMg = 0;
  let wornMg = 0;
  let consumableMg = 0;
  let hasWeights = false;

  for (const item of list.items) {
    const line = lineMg(item);
    if (item.unitWeightMg > 0) hasWeights = true;
    totalMg += line;
    const cls = effectiveClassification(item, list.folders);
    if (cls === "worn") wornMg += line;
    else if (cls === "consumable") consumableMg += line;
  }

  return {
    totalMg,
    wornMg,
    consumableMg,
    baseMg: totalMg - wornMg - consumableMg,
    itemCount: list.items.length,
    hasWeights,
  };
}

/** Format milligrams for display. Auto-promotes g→kg / oz→lb when large. */
export function formatWeight(
  mg: number,
  unit: Unit,
  opts: { auto?: boolean; withUnit?: boolean } = {},
): string {
  const { auto = true, withUnit = true } = opts;
  let outUnit = unit;
  if (auto) {
    if (unit === "g" && mg >= 1_000_000) outUnit = "kg";
    if (unit === "oz" && mg >= 16 * MG_PER_UNIT.oz) outUnit = "lb";
  }
  const value = fromMg(mg, outUnit);
  const decimals = outUnit === "g" ? 0 : outUnit === "kg" ? 2 : outUnit === "oz" ? 1 : 2;
  const num = value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return withUnit ? `${num} ${outUnit}` : num;
}

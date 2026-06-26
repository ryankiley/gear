// Plain-text summary — for pasting into Messages / a Reddit comment / anywhere
// that isn't a rich editor. ~0 KB, no deps.

import type { ListSnapshot } from "../types";
import { computeTotals, formatWeight } from "../weights";

export function listToSummary(list: ListSnapshot, url?: string): string {
  const t = computeTotals(list);
  const u = list.displayUnit;
  const lines: string[] = [list.title || "Gear list"];
  if (t.hasWeights) {
    lines.push(
      `Base ${formatWeight(t.baseMg, u)} · Total ${formatWeight(t.totalMg, u)} · ${t.itemCount} items`,
    );
  } else {
    lines.push(`${t.itemCount} item${t.itemCount === 1 ? "" : "s"}`);
  }
  if (url) lines.push(url);
  return lines.join("\n");
}

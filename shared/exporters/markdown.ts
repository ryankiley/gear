// Markdown export — pure string building, ~0 KB, no deps. Pastes cleanly into
// Apple Notes. Shared by the client (copy/download) and later the server.

import type { GearList } from "../types";
import { computeTotals, formatWeight, lineMg } from "../weights";

export function listToMarkdown(list: GearList): string {
  const u = list.displayUnit;
  const totals = computeTotals(list);
  const out: string[] = [];

  out.push(`# ${list.title || "Gear list"}`);
  out.push("");

  for (const folder of list.folders) {
    const items = list.items
      .filter((i) => i.folderId === folder.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (!items.length) continue;
    out.push(`## ${folder.name}`);
    out.push("");
    out.push("| Item | Qty | Weight |");
    out.push("| --- | ---: | ---: |");
    for (const it of items) {
      const w = it.unitWeightMg > 0 ? formatWeight(lineMg(it), u) : "—";
      const name = it.brand ? `${it.brand} ${it.name}` : it.name;
      out.push(`| ${name} | ${it.qty} | ${w} |`);
    }
    out.push("");
  }

  if (totals.hasWeights) {
    out.push("---");
    out.push("");
    out.push(`- **Base weight:** ${formatWeight(totals.baseMg, u)}`);
    out.push(`- **Worn:** ${formatWeight(totals.wornMg, u)}`);
    out.push(`- **Consumable:** ${formatWeight(totals.consumableMg, u)}`);
    out.push(`- **Total:** ${formatWeight(totals.totalMg, u)}`);
  }

  return out.join("\n");
}

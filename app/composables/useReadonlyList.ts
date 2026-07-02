import type { Ref } from "vue";
import { seasonLabel, tripTypeLabel } from "~~/shared/discovery";
import type { ListSnapshot, Totals, Unit } from "~~/shared/types";
import { computeTotals, formatWeightAuto } from "~~/shared/weights";

// Shared reactive view-model for the two read-only pages (/s/[code] + /l/[slug]):
// a viewer-chosen display unit, the rolled-up totals, the unit-reskinned list the
// readonly components render, and the non-empty folders/ungrouped split. The two
// pages differ only in chrome (SEO/report on /l, live-poll on /s) — the data
// shaping is identical and lives here so it can't drift.
export function useReadonlyList(snapshot: Ref<ListSnapshot | null>) {
  // Shared read-only views always START in grams — they deliberately DON'T inherit
  // the owner's saved displayUnit, so a shared link reads the same for everyone
  // regardless of the unit the owner happens to edit in. The viewer can still
  // toggle the unit locally (below); that choice is never persisted.
  const unit = ref<Unit>("g");
  const totals = computed(() => (snapshot.value ? computeTotals(snapshot.value) : null));
  // re-skin the snapshot with the viewer's chosen unit; readonly components read list.displayUnit
  const roList = computed(() =>
    snapshot.value ? { ...snapshot.value, displayUnit: unit.value } : null,
  );
  const ungrouped = computed(() =>
    snapshot.value ? snapshot.value.items.filter((i) => !i.folderId) : [],
  );
  // a shared list shouldn't show empty folders (one Set pass, not an
  // items.some() scan per folder)
  const shownFolders = computed(() => {
    if (!roList.value) return [];
    const withItems = new Set(snapshot.value!.items.map((i) => i.folderId));
    return roList.value.folders.filter((f) => withItems.has(f.id));
  });
  return { unit, totals, roList, ungrouped, shownFolders };
}

/**
 * Shared SEO summary for the two read-only pages: the trip/season facet labels
 * and the meta/OG description ("{title} — a {kind} packing list (…) …"). The
 * pages differ only in two words of copy, passed in — the assembly is identical
 * and lives here so it can't drift.
 */
export function useReadonlyListSeo(
  snapshot: Ref<ListSnapshot | null>,
  totals: Ref<Totals | null>,
  opts: { kind: string; cta: string },
) {
  const facets = computed(
    () =>
      [tripTypeLabel(snapshot.value?.tripType), seasonLabel(snapshot.value?.season)].filter(
        Boolean,
      ) as string[],
  );
  const desc = computed(() => {
    if (!snapshot.value || !totals.value) return `A ${opts.kind} packing list on Mahonia.`;
    const bits = [`${totals.value.itemCount} items`];
    if (facets.value.length) bits.unshift(facets.value.join(", "));
    if (totals.value.hasWeights)
      bits.push(`${formatWeightAuto(totals.value.baseMg)} base weight`);
    return `${snapshot.value.title} — a ${opts.kind} packing list (${bits.join(" · ")}). ${opts.cta}`;
  });
  return { facets, desc };
}

import type { Ref } from "vue";
import type { ListSnapshot, Unit } from "~~/shared/types";
import { computeTotals } from "~~/shared/weights";

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
  // a shared list shouldn't show empty folders
  const shownFolders = computed(() =>
    roList.value
      ? roList.value.folders.filter((f) => snapshot.value!.items.some((i) => i.folderId === f.id))
      : [],
  );
  return { unit, totals, roList, ungrouped, shownFolders };
}

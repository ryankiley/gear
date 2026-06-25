import { useStorage } from "@vueuse/core";
import type { Classification, Folder, GearList, Item, Unit } from "~~/shared/types";
import { STARTER_FOLDERS } from "~~/shared/categories";
import { computeTotals, parseWeightInput } from "~~/shared/weights";

// Client-first persistence. Lists live in localStorage for now; the server +
// dual-token sharing layer comes next and this maps 1:1 onto it (the local id
// becomes the edit token, and "My Lists" becomes the token registry).
const STORAGE_KEY = "gear.lists.v1";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

// One shared ref across all callers in the tab — @vueuse useStorage doesn't
// cross-sync multiple same-key refs within one document, so cache it.
let _lists: ReturnType<typeof useStorage<GearList[]>> | undefined;

export function useGearStore() {
  if (!_lists) _lists = useStorage<GearList[]>(STORAGE_KEY, []);
  const lists = _lists;

  const allLists = computed(() =>
    [...lists.value].sort((a, b) => b.updatedAt - a.updatedAt),
  );

  const getList = (id: string) => lists.value.find((l) => l.id === id);

  function touch(list: GearList) {
    list.version += 1;
    list.updatedAt = Date.now();
    // Force useStorage to persist: its deep watch doesn't reliably catch
    // nested array/object mutations, but it does catch a top-level array
    // change. Spread is shallow, so the editor keeps the same object refs.
    lists.value = [...lists.value];
  }

  function createList(title = "Untitled list"): string {
    const id = uid();
    const folders: Folder[] = STARTER_FOLDERS.map((p, i) => ({
      id: uid(),
      name: p.name,
      colorKey: p.colorKey,
      defaultClassification: p.defaultClassification,
      sortOrder: i,
    }));
    lists.value.push({
      id,
      title,
      displayUnit: "g",
      folders,
      items: [],
      version: 1,
      updatedAt: Date.now(),
    });
    return id;
  }

  function deleteList(id: string) {
    lists.value = lists.value.filter((l) => l.id !== id);
  }

  // ---- folders ----
  function addFolder(list: GearList, name = "New folder") {
    list.folders.push({
      id: uid(),
      name,
      colorKey: "other",
      defaultClassification: "base",
      sortOrder: list.folders.length,
    });
    touch(list);
  }
  function removeFolder(list: GearList, folderId: string) {
    list.folders = list.folders.filter((f) => f.id !== folderId);
    list.items = list.items.filter((i) => i.folderId !== folderId);
    touch(list);
  }

  // ---- items ----
  function addItem(
    list: GearList,
    folderId: string,
    fields: { name: string; weight?: string; qty?: number },
  ) {
    const name = fields.name.trim();
    if (!name) return;
    const mg = fields.weight
      ? (parseWeightInput(fields.weight, list.displayUnit) ?? 0)
      : 0;
    const siblings = list.items.filter((i) => i.folderId === folderId);
    list.items.push({
      id: uid(),
      folderId,
      name,
      unitWeightMg: mg,
      qty: fields.qty && fields.qty > 0 ? fields.qty : 1,
      classification: null,
      sortOrder: siblings.length,
    });
    touch(list);
  }
  function updateItem(list: GearList, id: string, patch: Partial<Item>) {
    const it = list.items.find((i) => i.id === id);
    if (!it) return;
    Object.assign(it, patch);
    touch(list);
  }
  function setItemWeight(list: GearList, id: string, raw: string) {
    const mg = parseWeightInput(raw, list.displayUnit);
    if (mg === null) return;
    updateItem(list, id, { unitWeightMg: mg, weightOverridden: true });
  }
  function removeItem(list: GearList, id: string) {
    list.items = list.items.filter((i) => i.id !== id);
    touch(list);
  }

  function setUnit(list: GearList, unit: Unit) {
    list.displayUnit = unit;
    touch(list);
  }

  const totalsFor = (list: GearList) => computeTotals(list);

  return {
    lists,
    allLists,
    getList,
    createList,
    deleteList,
    addFolder,
    removeFolder,
    addItem,
    updateItem,
    setItemWeight,
    removeItem,
    setUnit,
    totalsFor,
    touch,
  };
}

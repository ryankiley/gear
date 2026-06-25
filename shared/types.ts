// Domain types shared by the client editor and (later) the server/DB.
// Mirrors the planned Postgres schema so wiring the server stays mechanical.

export type Unit = "g" | "kg" | "oz" | "lb";

// One field, not two booleans — structurally prevents "worn AND consumable".
// `base` = counts toward base weight; `worn` = on your body; `consumable` = food/fuel/water.
export type Classification = "base" | "worn" | "consumable";

export interface Folder {
  id: string;
  name: string;
  /** maps to a `--cat-*` color token */
  colorKey?: string;
  /** items inherit this unless they set their own classification */
  defaultClassification: Classification;
  sortOrder: number;
}

export interface Item {
  id: string;
  folderId: string | null;
  /** product name */
  name: string;
  /** company / maker */
  brand?: string;
  /** the user's truth for THIS list, in integer milligrams */
  unitWeightMg: number;
  /** true once the user edits weight away from a catalog value */
  weightOverridden?: boolean;
  qty: number;
  /** null = inherit the folder's defaultClassification */
  classification: Classification | null;
  /** optional freeform user text */
  description?: string;
  productUrl?: string;
  imageUrl?: string;
  priceCents?: number;
  currency?: string;
  /** packing-day checklist state */
  packed?: boolean;
  sortOrder: number;
}

export interface GearList {
  id: string;
  title: string;
  description?: string;
  displayUnit: Unit;
  folders: Folder[];
  items: Item[];
  /** optimistic-concurrency / live-sync counter */
  version: number;
  updatedAt: number;
}

export interface Totals {
  totalMg: number;
  baseMg: number;
  wornMg: number;
  consumableMg: number;
  itemCount: number;
  hasWeights: boolean;
}

// Canonical category color keys (map to `--cat-*` tokens in SCSS) and the
// starter folder set a brand-new list begins with. Folders are user-named and
// fully editable — these are just sensible defaults.

import type { Classification } from "./types";

export const CATEGORY_KEYS = [
  "shelter",
  "sleep",
  "pack",
  "kitchen",
  "water",
  "clothing",
  "electronics",
  "firstaid",
  "worn",
  "consumable",
  "other",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export interface FolderPreset {
  name: string;
  colorKey: CategoryKey;
  defaultClassification: Classification;
}

// A calm default set. "On Body" defaults worn, "Food & Fuel" defaults
// consumable, everything else base — so the weight math is right out of the box
// without the user touching a single flag.
export const STARTER_FOLDERS: FolderPreset[] = [
  { name: "Shelter", colorKey: "shelter", defaultClassification: "base" },
  { name: "Sleep", colorKey: "sleep", defaultClassification: "base" },
  { name: "Pack", colorKey: "pack", defaultClassification: "base" },
  { name: "Kitchen", colorKey: "kitchen", defaultClassification: "base" },
  { name: "On Body", colorKey: "worn", defaultClassification: "worn" },
  { name: "Food & Fuel", colorKey: "consumable", defaultClassification: "consumable" },
];

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  base: "Base",
  worn: "Worn",
  consumable: "Consumable",
};

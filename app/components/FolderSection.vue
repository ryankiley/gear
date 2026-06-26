<script setup lang="ts">
import type { Classification, Folder, ListSnapshot } from "~~/shared/types";
import { lineMg, formatWeight } from "~~/shared/weights";

const props = withDefaults(
  defineProps<{ list: ListSnapshot; folder: Folder; packed?: boolean; readonly?: boolean }>(),
  { packed: false, readonly: false },
);
const c = useGearList();

const items = computed(() =>
  props.list.items
    .filter((i) => i.folderId === props.folder.id)
    .sort((a, b) => a.sortOrder - b.sortOrder),
);

const folderMg = computed(() => items.value.reduce((s, i) => s + lineMg(i), 0));

// add via the Maps-grade ItemInput: a catalog pick fills name/brand/weight + links
// the catalog id; free text falls back to a typed name (+ optional trailing weight).
function onCommit(p: {
  name: string;
  brand?: string;
  weight?: string;
  weightMg?: number;
  catalogItemId?: number;
}) {
  c.addItem(props.folder.id, p);
}

const CLASS_OPTS: { value: Classification; label: string }[] = [
  { value: "base", label: "Base" },
  { value: "worn", label: "Worn" },
  { value: "consumable", label: "Consumable" },
];
</script>

<template>
  <section class="folder">
    <header class="folder__head">
      <div class="folder__title">
        <span class="swatch" :style="{ background: `var(--cat-${folder.colorKey ?? 'other'})` }" />
        <span v-if="readonly" class="folder__name">{{ folder.name }}</span>
        <input
          v-else
          class="field folder__name"
          :value="folder.name"
          :disabled="packed"
          @change="c.updateFolder(folder.id, { name: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <span v-if="folderMg > 0" class="t-num t-sm t-muted folder__weight">{{ formatWeight(folderMg, list.displayUnit) }}</span>
      <select
        v-if="!packed && !readonly"
        class="field folder__class"
        :value="folder.defaultClassification"
        title="Default for items in this folder"
        @change="c.updateFolder(folder.id, { defaultClassification: ($event.target as HTMLSelectElement).value as Classification })"
      >
        <option v-for="o in CLASS_OPTS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <button
        v-if="!packed && !readonly"
        class="btn btn--icon btn--ghost folder__del"
        title="Remove folder"
        aria-label="Remove folder"
        @click="c.removeFolder(folder.id)"
      >
        ✕
      </button>
    </header>

    <div class="folder__items">
      <ItemRow v-for="it in items" :key="it.id" :list="list" :item="it" :packed="packed" :readonly="readonly" />
      <p v-if="!items.length && !packed && !readonly" class="t-sm t-muted folder__empty">No items yet.</p>
      <p v-else-if="!items.length && readonly" class="t-sm t-muted folder__empty">—</p>
    </div>

    <div v-if="!packed && !readonly" class="folder__add">
      <ItemInput :unit="list.displayUnit" with-weight @commit="onCommit" />
    </div>
  </section>
</template>

<style scoped>
/* de-outlined: no card box — the heading + the colored dot + whitespace separate folders */
.folder {
  padding: 0;
}
/* same column template as ItemRow so folder totals line up with item weights */
.folder__head {
  display: grid;
  grid-template-columns: 1fr 56px 84px 110px 32px;
  gap: var(--space-3);
  align-items: baseline;
  margin-bottom: var(--space-1);
}
.folder__title {
  grid-column: 1 / 3;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  min-width: 0;
}
.folder__title .swatch {
  align-self: center;
}
.folder__name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: var(--text-title);
  letter-spacing: -0.02em;
}
.folder__weight {
  grid-column: 3;
  text-align: right;
  white-space: nowrap;
}
.folder__class {
  grid-column: 4;
  width: auto;
  font-size: var(--text-sm);
  color: var(--ink-2);
}
.folder__del {
  grid-column: 5;
}

@media (max-width: 560px) {
  .folder__head {
    grid-template-columns: 1fr auto auto;
  }
  .folder__title {
    grid-column: 1;
  }
  .folder__weight {
    grid-column: auto;
  }
  .folder__class {
    grid-column: auto;
  }
  .folder__del {
    grid-column: auto;
  }
}
.folder__empty {
  padding: var(--space-2) 0;
}
.folder__add {
  margin-top: var(--space-1);
}
.folder__addinput {
  width: 100%;
  color: var(--ink-2);
}
</style>

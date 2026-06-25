<script setup lang="ts">
import { formatWeight } from "~~/shared/weights";

const store = useGearStore();
const router = useRouter();

function newList() {
  const id = store.createList();
  router.push(`/e#${id}`);
}
</script>

<template>
  <div>
    <header class="hero topo">
      <div class="wrap hero__inner">
        <p class="t-label">Gear · pack lists, weighed</p>
        <h1 class="t-display hero__title">Make a packing list.<br />See what it weighs.</h1>
        <p class="hero__sub t-muted">
          A calm place to build a list and share it. Weights are optional — add
          them when you care. No login.
        </p>
        <button class="btn btn--primary hero__cta" @click="newList">
          Start a list
        </button>
      </div>
    </header>

    <main class="wrap mylists">
      <div class="spread mylists__head">
        <h2 class="t-h3">Your lists</h2>
        <span class="t-micro t-faint">saved in this browser</span>
      </div>

      <p v-if="!store.allLists.value.length" class="t-muted mylists__empty">
        Nothing yet. Start a list above — it’ll show up here next time you visit.
      </p>

      <ul v-else class="mylists__grid">
        <li v-for="l in store.allLists.value" :key="l.id">
          <NuxtLink :to="`/e#${l.id}`" class="card">
            <span class="card__title t-h3">{{ l.title || "Untitled list" }}</span>
            <span class="card__meta t-micro t-muted">
              {{ l.items.length }} item{{ l.items.length === 1 ? "" : "s" }}
              <template v-if="store.totalsFor(l).hasWeights">
                · <span class="t-num">{{ formatWeight(store.totalsFor(l).baseMg, l.displayUnit) }}</span> base
              </template>
            </span>
            <button
              class="btn btn--icon btn--ghost card__del"
              title="Delete list"
              @click.prevent="store.deleteList(l.id)"
            >
              ✕
            </button>
          </NuxtLink>
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
.hero {
  border-bottom: 1px solid var(--line-2);
}
.hero__inner {
  padding-block: var(--space-8) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.hero__title {
  max-width: 16ch;
}
.hero__sub {
  max-width: 46ch;
  font-size: var(--t-base);
}
.hero__cta {
  align-self: flex-start;
  margin-top: var(--space-2);
  min-height: 48px;
  padding-inline: var(--space-6);
}
.mylists {
  padding-block: var(--space-7);
}
.mylists__head {
  margin-bottom: var(--space-4);
}
.mylists__empty {
  padding: var(--space-6) 0;
}
.mylists__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-3);
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--line-2);
  background: var(--paper-2);
  transition: border-color var(--dur) var(--ease);
}
.card:hover {
  border-color: var(--ink);
}
.card__del {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  color: var(--ink-3);
  opacity: 0;
}
.card:hover .card__del {
  opacity: 1;
}
</style>

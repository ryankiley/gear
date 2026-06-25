<script setup lang="ts">
import { listToMarkdown } from "~~/shared/exporters/markdown";

const store = useGearStore();
const router = useRouter();

const id = ref("");
onMounted(() => {
  id.value = decodeURIComponent(location.hash.replace(/^#/, ""));
});

const list = computed(() => (id.value ? store.getList(id.value) : undefined));
const totals = computed(() => (list.value ? store.totalsFor(list.value) : null));

const showBreakdown = ref(false);
const packed = ref(false);
const toast = ref("");

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function flash(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 1800);
}

async function copyMarkdown() {
  if (!list.value) return;
  try {
    await navigator.clipboard.writeText(listToMarkdown(list.value));
    flash("Copied as Markdown");
  } catch {
    flash("Copy failed");
  }
}

function newList() {
  const newId = store.createList();
  router.push(`/e#${newId}`);
  id.value = newId;
}
</script>

<template>
  <div class="editor">
    <header class="topbar">
      <div class="wrap topbar__inner">
        <NuxtLink to="/" class="btn btn--sm btn--ghost">← Lists</NuxtLink>
        <input
          v-if="list"
          class="field editor__title"
          :value="list.title"
          placeholder="Untitled list"
          @change="(e) => { list!.title = (e.target as HTMLInputElement).value; store.touch(list!); }"
        />
        <button v-if="list" class="btn btn--sm" @click="copyMarkdown">Copy Markdown</button>
      </div>
    </header>

    <main v-if="list && totals" class="wrap editor__body">
      <TotalsBar
        :list="list"
        :totals="totals"
        v-model:show-breakdown="showBreakdown"
        v-model:packed="packed"
        @set-unit="(u) => store.setUnit(list!, u)"
      />

      <div class="editor__folders">
        <FolderSection
          v-for="f in list.folders"
          :key="f.id"
          :list="list"
          :folder="f"
          :packed="packed"
        />
      </div>

      <button v-if="!packed" class="btn editor__addfolder" @click="store.addFolder(list)">
        + Add folder
      </button>
    </main>

    <main v-else class="wrap editor__missing">
      <p class="t-muted">This list isn’t in this browser.</p>
      <button class="btn btn--primary" @click="newList">Start a new list</button>
    </main>

    <Transition name="toast">
      <div v-if="toast" class="toast t-small">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--paper);
  border-bottom: 1px solid var(--line-2);
}
.topbar__inner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-2);
}
.editor__title {
  flex: 1;
  font-family: var(--font-serif);
  font-size: var(--t-h3);
  border-bottom-color: transparent;
}
.editor__title:focus {
  border-bottom-color: var(--accent);
}
.editor__body {
  padding-block: var(--space-4) var(--space-9);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.editor__folders {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.editor__addfolder {
  align-self: flex-start;
}
.editor__missing {
  padding-block: var(--space-9);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
}
.toast {
  position: fixed;
  left: 50%;
  bottom: var(--space-5);
  transform: translateX(-50%);
  background: var(--ink);
  color: var(--paper);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-0);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>

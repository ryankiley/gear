<script setup lang="ts">
import { formatWeight } from "~~/shared/weights";

const { target, submitting, close, submit } = useCatalogCorrection();
const emit = defineEmits<{ done: [{ status: string; itemName?: string }] }>();

const weight = ref("");
const sourceUrl = ref("");
const reason = ref("");

// prefill the user's current weight as the suggestion whenever the dialog opens
watch(target, (t) => {
  if (t) {
    weight.value = formatWeight(t.suggestedMg, t.displayUnit);
    sourceUrl.value = "";
    reason.value = "";
  }
});

async function onSubmit() {
  const res = await submit({
    weight: weight.value,
    sourceUrl: sourceUrl.value.trim() || undefined,
    reason: reason.value.trim() || undefined,
  });
  if (res) {
    emit("done", res);
    close();
  }
}

onKeyStroke("Escape", () => target.value && close());
</script>

<template>
  <Transition name="ovl">
    <div v-if="target" class="ovl" @click.self="close()">
      <div class="dlg panel" role="dialog" aria-modal="true" aria-label="Fix catalog weight">
        <p class="t-label">Fix catalog weight</p>
        <p class="dlg__item">{{ target.itemName }}</p>
        <p class="t-sm t-muted dlg__lede">
          Catalog lists {{ formatWeight(target.catalogWeightMg, target.displayUnit) }}. Suggest the
          correct weight — this fixes it for everyone, not just your list.
        </p>

        <label class="dlg__field">
          <span class="t-sm t-muted">Correct weight</span>
          <input v-model="weight" class="field" inputmode="decimal" @keydown.enter="onSubmit" />
        </label>
        <label class="dlg__field">
          <span class="t-sm t-muted">Source link <em>— a manufacturer/retailer page applies it instantly</em></span>
          <input v-model="sourceUrl" class="field" placeholder="https://" inputmode="url" @keydown.enter="onSubmit" />
        </label>
        <label class="dlg__field">
          <span class="t-sm t-muted">Note (optional)</span>
          <input v-model="reason" class="field" maxlength="200" @keydown.enter="onSubmit" />
        </label>

        <div class="dlg__actions">
          <button class="btn btn--ghost" @click="close()">Cancel</button>
          <button class="btn btn--primary" :disabled="submitting" @click="onSubmit">
            {{ submitting ? "Sending…" : "Suggest fix" }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ovl {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: light-dark(#1d1c1c80, #00000099);
}
.dlg {
  width: 100%;
  max-width: 30rem;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  /* solid surface + hairline (no soft shadow — brutalist) so it reads off the scrim */
  background: var(--paper);
  border: 1px solid var(--line-2);
}
.dlg__item {
  font-size: var(--text-title);
  font-weight: 600;
  letter-spacing: -0.02em;
}
.dlg__lede {
  margin-bottom: var(--space-2);
}
.dlg__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.dlg__field em {
  font-style: normal;
  color: var(--accent);
}
.dlg__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.ovl-enter-active,
.ovl-leave-active {
  transition: opacity var(--dur) var(--ease);
}
.ovl-enter-from,
.ovl-leave-to {
  opacity: 0;
}
</style>

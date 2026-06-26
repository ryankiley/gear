import type { PublishState } from "~~/shared/discovery";

// Drives the "Make public" dialog. Singleton (module-level) like
// useCatalogCorrection: the trigger lives in the editor menu, the dialog is
// mounted once, and this connects them. The edit token is read from the live
// editor controller and sent as a Bearer header — it never touches the path.

const isOpen = ref(false);
const state = ref<PublishState | null>(null);
const loading = ref(false);
const submitting = ref(false);

export function usePublish() {
  const gear = useGearList();
  const authHeaders = () => ({ Authorization: `Bearer ${gear.editToken}` });

  async function open() {
    isOpen.value = true;
    state.value = null;
    loading.value = true;
    try {
      const res = await $fetch<{ state: PublishState }>("/api/edit/publish", {
        headers: authHeaders(),
      });
      state.value = res.state;
    } catch {
      state.value = null;
    } finally {
      loading.value = false;
    }
  }

  function close() {
    isOpen.value = false;
    submitting.value = false;
  }

  async function submit(input: {
    isPublic: boolean;
    tripType?: string | null;
    season?: string | null;
  }): Promise<PublishState | null> {
    submitting.value = true;
    try {
      const res = await $fetch<{ state: PublishState }>("/api/edit/publish", {
        method: "POST",
        headers: authHeaders(),
        body: input,
      });
      state.value = res.state;
      // mirror the new state into the editor snapshot so the menu label updates
      if (gear.snapshot.value) {
        gear.snapshot.value = {
          ...gear.snapshot.value,
          isPublic: res.state.isPublic,
          tripType: res.state.tripType,
          season: res.state.season,
        };
      }
      return res.state;
    } catch {
      return null;
    } finally {
      submitting.value = false;
    }
  }

  return { isOpen, state, loading, submitting, open, close, submit };
}

import type { Op } from "~~/shared/ops";
import { applyOps } from "~~/shared/ops";
import type { Classification, Folder, Item, ListSnapshot, Unit } from "~~/shared/types";
import { computeTotals, parseWeightInput } from "~~/shared/weights";

// Editor controller (one list open at a time → module singleton). Mutations are
// applied optimistically via the SAME op-reducer the server uses, queued, and
// flushed (debounced). A poll pulls other editors' merged changes live.

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

type Status = "idle" | "loading" | "saving" | "synced" | "missing" | "error";

let singleton: ReturnType<typeof create> | undefined;

function create() {
  const snapshot = ref<ListSnapshot | null>(null);
  const status = ref<Status>("idle");
  let editToken = "";
  let pending: Op[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let isEditing = false;

  const totals = computed(() =>
    snapshot.value ? computeTotals(snapshot.value) : null,
  );

  function authHeaders() {
    return { Authorization: `Bearer ${editToken}` } as Record<string, string>;
  }

  function syncRegistry() {
    if (!snapshot.value) return;
    useMyLists().touch(editToken, {
      title: snapshot.value.title,
      version: snapshot.value.version,
      totalMg: computeTotals(snapshot.value).totalMg,
    });
  }

  async function load(token: string) {
    editToken = token;
    status.value = "loading";
    try {
      const res = await $fetch<{ snapshot: ListSnapshot }>("/api/edit/list", {
        headers: authHeaders(),
      });
      snapshot.value = res.snapshot;
      status.value = "synced";
      syncRegistry();
      startPoll();
      installFocusTracking();
    } catch (e: any) {
      status.value = e?.statusCode === 404 ? "missing" : "error";
    }
  }

  function dispatch(op: Op) {
    if (!snapshot.value) return;
    // optimistic: same reducer as the server
    applyOps(snapshot.value as any, [op]);
    snapshot.value = { ...snapshot.value };
    pending.push(op);
    scheduleFlush();
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 450);
  }

  async function flush() {
    if (inFlight || !pending.length || !snapshot.value) return;
    const ops = pending;
    pending = [];
    inFlight = true;
    status.value = "saving";
    try {
      const res = await $fetch<{ snapshot: ListSnapshot }>("/api/edit/mutate", {
        method: "POST",
        headers: authHeaders(),
        body: { ops },
      });
      // adopt authoritative state only if the user isn't mid-edit and nothing
      // new is queued (avoid clobbering in-progress typing / racing a newer op)
      if (!isEditing && !pending.length) snapshot.value = res.snapshot;
      else if (snapshot.value) snapshot.value.version = res.snapshot.version;
      status.value = "synced";
      syncRegistry();
    } catch (e) {
      pending = ops.concat(pending); // re-queue and retry shortly
      status.value = "error";
      setTimeout(scheduleFlush, 1500);
    } finally {
      inFlight = false;
      if (pending.length) scheduleFlush();
    }
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (inFlight || pending.length || !snapshot.value) return;
      try {
        const res = await $fetch<{ version: number; snapshot?: ListSnapshot }>(
          "/api/edit/changes",
          { headers: authHeaders(), query: { since: snapshot.value.version } },
        );
        if (res.snapshot && !isEditing && !pending.length && !inFlight) {
          snapshot.value = res.snapshot;
          syncRegistry();
        }
      } catch {
        /* transient */
      }
    }, 3000);
  }
  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
  }

  function installFocusTracking() {
    if (typeof window === "undefined") return;
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    window.addEventListener("focusin", (e) => { if (isField(e.target)) isEditing = true; });
    window.addEventListener("focusout", () => { isEditing = false; });
  }

  // ---- convenience mutators ----
  const setMeta = (patch: Partial<{ title: string; description: string; displayUnit: Unit }>) =>
    dispatch({ t: "setMeta", patch });
  const setUnit = (displayUnit: Unit) => setMeta({ displayUnit });

  function addFolder(name = "New folder") {
    const sortOrder = snapshot.value?.folders.length ?? 0;
    dispatch({ t: "addFolder", folder: { id: uid(), name, colorKey: "other", defaultClassification: "base", sortOrder } });
  }
  const updateFolder = (id: string, patch: Partial<Folder>) =>
    dispatch({ t: "updateFolder", id, patch });
  const removeFolder = (id: string) => dispatch({ t: "removeFolder", id });

  function addItem(folderId: string, fields: { name: string; weight?: string; qty?: number }) {
    const name = fields.name.trim();
    if (!name || !snapshot.value) return;
    const mg = fields.weight ? (parseWeightInput(fields.weight, snapshot.value.displayUnit) ?? 0) : 0;
    const sortOrder = snapshot.value.items.filter((i) => i.folderId === folderId).length;
    const item: Item = {
      id: uid(), folderId, name, unitWeightMg: mg,
      qty: fields.qty && fields.qty > 0 ? fields.qty : 1,
      classification: null, sortOrder,
    };
    dispatch({ t: "addItem", item });
  }
  const updateItem = (id: string, patch: Partial<Item>) => dispatch({ t: "updateItem", id, patch });
  const removeItem = (id: string) => dispatch({ t: "removeItem", id });
  function setItemWeight(id: string, raw: string) {
    if (!snapshot.value) return;
    if (raw.trim() === "") return updateItem(id, { unitWeightMg: 0, weightOverridden: true });
    const mg = parseWeightInput(raw, snapshot.value.displayUnit);
    if (mg !== null) updateItem(id, { unitWeightMg: mg, weightOverridden: true });
  }

  async function rotate(): Promise<string | null> {
    try {
      const res = await $fetch<{ editToken: string }>("/api/edit/rotate", {
        method: "POST",
        headers: authHeaders(),
      });
      const old = editToken;
      editToken = res.editToken;
      const my = useMyLists();
      const prev = my.entries.value.find((e) => e.editToken === old);
      my.forget(old);
      if (prev) my.upsert({ ...prev, editToken: res.editToken, lastOpened: Date.now() });
      return res.editToken;
    } catch {
      return null;
    }
  }

  function dispose() {
    stopPoll();
    clearTimeout(flushTimer);
    snapshot.value = null;
    pending = [];
    editToken = "";
    status.value = "idle";
  }

  return {
    snapshot, totals, status,
    get editToken() { return editToken; },
    load, dispose, rotate,
    setMeta, setUnit, addFolder, updateFolder, removeFolder,
    addItem, updateItem, removeItem, setItemWeight,
  };
}

export function useGearList() {
  if (!singleton) singleton = create();
  return singleton;
}

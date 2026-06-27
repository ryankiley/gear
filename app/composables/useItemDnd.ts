// Pointer-based drag-to-reorder for item rows — within a folder and across
// folders. Mouse + touch (Pointer Events). Item rows expose `data-item-id`,
// folders expose `data-folder`; the drop commits via useGearList().moveItem on
// pointerup. The dragged row isn't live-reordered — a drop indicator shows where
// it will land, keeping the DOM stable during the drag.

export interface DropTarget {
  folderId: string | null;
  beforeId: string | null; // item to insert before; null = append to folder end
}

let singleton: ReturnType<typeof create> | undefined;

function create() {
  const dragId = ref<string | null>(null);
  const drop = ref<DropTarget | null>(null);
  // live vertical offset of the lifted row from where it was picked up, so the
  // dragged item visibly tracks the pointer (the "carry" feel) instead of just
  // dimming in place. Pixels.
  const dy = ref(0);
  let startY = 0;
  // The pointer id we explicitly captured (see start()), so we can release it on
  // reset. -1 = nothing captured.
  let capturedId = -1;
  // true when the pointer is fully clear of the editing surface (over the sticky
  // top bar, the footer, or off-screen). A release while outside cancels instead of
  // committing — the touch-reachable abort, since there's no Escape key on mobile.
  let outside = false;

  function onMove(ev: PointerEvent) {
    if (!dragId.value) return;
    dy.value = ev.clientY - startY;
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    // a gap *between* folders still counts as in-list (persist + commit); only a
    // release clear of the whole editor body reads as a cancel.
    outside = !el?.closest(".editor__body");
    const folderEl = el?.closest("[data-folder]") as HTMLElement | null;
    // off to the side / in a gap between folders → keep the last target rather than
    // dropping it, so the indicator doesn't flicker and a release still commits.
    if (!folderEl) return;
    // a collapsed folder hides its rows (display:none → zero-rect), so dropping here
    // would silently append into a folder you can't see, with no indicator. Treat it
    // as a gap and keep the last visible target.
    if (folderEl.hasAttribute("data-collapsed")) return;
    const folderId = folderEl.getAttribute("data-folder") || null;
    // pick the insertion point purely by vertical position among this folder's rows
    // (excluding the one being dragged): land before the first row whose middle is
    // below the pointer, else append. This makes the whole row band a target — no
    // need to land exactly on a row, and the header drops it at the top, not the end.
    const rows = [...folderEl.querySelectorAll("[data-item-id]")].filter(
      (r) => r.getAttribute("data-item-id") !== dragId.value,
    ) as HTMLElement[];
    let beforeId: string | null = null;
    for (const r of rows) {
      const rect = r.getBoundingClientRect();
      if (ev.clientY < rect.top + rect.height / 2) {
        beforeId = r.getAttribute("data-item-id");
        break;
      }
    }
    drop.value = { folderId, beforeId };
  }

  function detach() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey);
  }

  // Escape aborts the drag without committing — the clean cancel now that a release
  // always commits to the last target.
  function onKey(ev: KeyboardEvent) {
    if (ev.key === "Escape") reset();
  }

  // Clear all drag state + listeners without committing. Safe to call any time
  // (re-entrant drag start, interrupted gesture, list dispose).
  function reset() {
    detach();
    if (typeof document !== "undefined") {
      document.body.style.userSelect = "";
      if (capturedId !== -1) {
        try {
          document.documentElement.releasePointerCapture(capturedId);
        } catch {
          /* pointer already gone */
        }
      }
    }
    capturedId = -1;
    dragId.value = null;
    drop.value = null;
    dy.value = 0;
  }

  function onUp() {
    const id = dragId.value;
    const target = drop.value;
    const cancelled = outside;
    reset();
    if (!cancelled && id && target) useGearList().moveItem(id, target.folderId, target.beforeId);
  }

  // touch/OS can end a gesture with pointercancel (second finger, edge-swipe,
  // scroll steal) instead of pointerup — drop the drag, commit nothing.
  function onCancel() {
    reset();
  }

  function start(itemId: string, ev: PointerEvent) {
    if (dragId.value) reset(); // never stack a second gesture's listeners
    ev.preventDefault();
    // Capture the pointer to the document root — a node that never becomes
    // pointer-events:none. On touch, pointerdown grants implicit capture to the
    // grip, but the lifted row immediately goes pointer-events:none (so drop
    // detection can see the rows underneath), which drops that implicit capture
    // and fires pointercancel — killing the drag before it starts. Explicit
    // capture on a stable node keeps the gesture alive; pointermove/up still
    // bubble to the window listeners below.
    capturedId = ev.pointerId;
    try {
      document.documentElement.setPointerCapture(ev.pointerId);
    } catch {
      capturedId = -1; // non-pointer / unsupported — fall back to plain listeners
    }
    dragId.value = itemId;
    drop.value = null;
    outside = false;
    startY = ev.clientY;
    dy.value = 0;
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
  }

  return { dragId, drop, dy, start, reset };
}

export function useItemDnd() {
  if (!singleton) singleton = create();
  return singleton;
}

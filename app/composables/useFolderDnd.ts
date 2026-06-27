// Pointer-based drag-to-reorder for FOLDERS (the grip handle in each folder
// header). Simpler than item DnD: folders only reorder within the one list. The
// dragged folder isn't live-moved — a drop indicator shows where it will land,
// and the commit happens on pointerup via useGearList().moveFolderBefore.

export interface FolderDropTarget {
  targetId: string; // folder being hovered
  before: boolean; // insert before (true) or after (false) the target
}

let singleton: ReturnType<typeof create> | undefined;

function create() {
  const dragId = ref<string | null>(null);
  const drop = ref<FolderDropTarget | null>(null);
  // Pointer id we explicitly captured (see start()); -1 = none.
  let capturedId = -1;
  // true when the pointer is fully clear of the editing surface — a release while
  // outside cancels instead of committing (the touch-reachable abort; no Escape key
  // on mobile).
  let outside = false;

  function onMove(ev: PointerEvent) {
    if (!dragId.value) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    outside = !el?.closest(".editor__body");
    const folderEl = el?.closest("[data-folder]") as HTMLElement | null;
    // in a gap / over the dragged folder itself → keep the last target, don't flicker
    if (!folderEl) return;
    const id = folderEl.getAttribute("data-folder");
    if (!id || id === dragId.value) return;
    // flip before/after at the HEADER's middle, not the whole folder's — a folder
    // full of items is tall, and its centre sits deep in the list, making the
    // "after" zone feel unreachable. The header is the handle, so judge from it.
    const head = (folderEl.querySelector(".folder__head") as HTMLElement | null) ?? folderEl;
    const rect = head.getBoundingClientRect();
    drop.value = { targetId: id, before: ev.clientY < rect.top + rect.height / 2 };
  }

  function detach() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey);
  }
  // Escape aborts the drag without committing.
  function onKey(ev: KeyboardEvent) {
    if (ev.key === "Escape") reset();
  }
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
  }
  function onUp() {
    const id = dragId.value;
    const target = drop.value;
    const cancelled = outside;
    reset();
    if (!cancelled && id && target) useGearList().moveFolderBefore(id, target.targetId, target.before);
  }
  function onCancel() {
    reset();
  }
  function start(folderId: string, ev: PointerEvent) {
    if (dragId.value) reset();
    ev.preventDefault();
    // Capture to the document root (never pointer-events:none) so a touch drag
    // survives even if the lifted folder's styles drop the grip's implicit
    // capture. Events still bubble to the window listeners below. See useItemDnd.
    capturedId = ev.pointerId;
    try {
      document.documentElement.setPointerCapture(ev.pointerId);
    } catch {
      capturedId = -1;
    }
    dragId.value = folderId;
    drop.value = null;
    outside = false;
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
  }

  return { dragId, drop, start };
}

export function useFolderDnd() {
  if (!singleton) singleton = create();
  return singleton;
}

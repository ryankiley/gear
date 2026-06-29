import {
  searchCatalogLocal,
  type CatalogSearchResult,
  type LocalCatalogRow,
} from "~~/shared/catalogSearch";

// On-device catalog snapshot for offline autocomplete. Pulls the full active
// catalog from /api/catalog/dump (gated server-side), stores it as ONE IndexedDB
// record, and searches it in memory with the SAME ranking the server uses
// (shared/catalogSearch). Best-effort throughout: any failure just leaves the
// last-known snapshot in place — this never blocks or breaks the live search.

interface CatalogSnapshot {
  version: string;
  syncedAt: number;
  items: LocalCatalogRow[];
}

const DB_NAME = "mahonia-catalog";
const STORE = "snapshot";
const KEY = "catalog";
const DB_VERSION = 1;
const STALE_MS = 24 * 60 * 60 * 1000; // re-pull at most once a day

let dbPromise: Promise<IDBDatabase> | undefined;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
function idbGet(): Promise<CatalogSnapshot | undefined> {
  return openDb()
    .then(
      (db) =>
        new Promise<CatalogSnapshot | undefined>((res) => {
          const r = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
          r.onsuccess = () => res(r.result);
          r.onerror = () => res(undefined);
        }),
    )
    .catch(() => undefined);
}
function idbSet(snap: CatalogSnapshot): Promise<void> {
  return openDb()
    .then(
      (db) =>
        new Promise<void>((res) => {
          const r = db.transaction(STORE, "readwrite").objectStore(STORE).put(snap, KEY);
          r.onsuccess = () => res();
          r.onerror = () => res();
        }),
    )
    .catch(() => {});
}

// In-memory snapshot, shared across every autocomplete instance on the page.
let memItems: LocalCatalogRow[] = [];
let primed = false;
let refreshing = false;

export function useCatalogCache() {
  const enabled = import.meta.client && typeof indexedDB !== "undefined";

  // Pull a fresh dump if we have nothing, or the cache is a day old. Skips while
  // offline (we keep the last snapshot) and when the flag is off server-side (the
  // dump 404s → caught → no-op).
  async function refresh(current?: CatalogSnapshot) {
    if (refreshing) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (current && Date.now() - current.syncedAt < STALE_MS) return;
    refreshing = true;
    try {
      const dump = await $fetch<{ version: string; items: LocalCatalogRow[] }>("/api/catalog/dump");
      if (dump?.items) {
        memItems = dump.items;
        await idbSet({ version: dump.version, syncedAt: Date.now(), items: dump.items });
      }
    } catch {
      /* offline / flag-off 404 / transient — keep the existing snapshot */
    } finally {
      refreshing = false;
    }
  }

  // Load the cached snapshot into memory once, then refresh in the background.
  async function prime(): Promise<void> {
    if (!enabled || primed) return;
    primed = true;
    const current = await idbGet();
    if (current?.items?.length) memItems = current.items;
    void refresh(current);
  }

  function searchLocal(q: string): CatalogSearchResult[] {
    return searchCatalogLocal(memItems, q);
  }

  return {
    prime,
    searchLocal,
    get size() {
      return memItems.length;
    },
  };
}

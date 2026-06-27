// Debounced, abortable catalog autocomplete client. Consumes /api/catalog/search
// (the catalog session's endpoint): fuzzy, ranked verified→usage→similarity.

export interface CatalogResult {
  id: number;
  brand: string | null;
  name: string;
  variant: string | null;
  weightMg: number;
  weightSource: string;
  verified: boolean;
}

export function useCatalogSearch() {
  const results = ref<CatalogResult[]>([]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let lastQ = "";

  function clear() {
    clearTimeout(timer);
    controller?.abort();
    results.value = [];
    lastQ = "";
  }

  function search(raw: string) {
    const q = raw.trim();
    clearTimeout(timer);
    if (q.length < 2) {
      results.value = [];
      return;
    }
    timer = setTimeout(async () => {
      lastQ = q;
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await $fetch<{ results: CatalogResult[] }>("/api/catalog/search", {
          query: { q },
          signal: controller.signal,
        });
        if (lastQ === q) results.value = res.results || [];
      } catch {
        /* abort / transient — keep prior results */
      }
    }, 140);
  }

  return { results, search, clear };
}

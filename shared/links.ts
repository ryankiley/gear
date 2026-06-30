// Build a Google web-search URL for a free-text query. Used by the read-only
// share views to let a viewer look up (and maybe buy) a gear item by name.
export function webSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

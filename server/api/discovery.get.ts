import { defineEventHandler, getQuery, setHeader } from "h3";
import { getFeed } from "../utils/discoveryRepo";
import { normalizeLimit, normalizeView } from "../../shared/discovery";
import { rateLimit } from "../utils/rateLimit";

// Public discovery feed query. Edge-cacheable (the response is identical for all
// visitors): a short s-maxage with stale-while-revalidate keeps it fast and
// collapses stampedes. Exposes only public addresses (slug + share code).
export default defineEventHandler(async (event) => {
  await rateLimit(event, "discovery", 120, 60_000);
  const q = getQuery(event);
  const view = normalizeView(q.view);
  const limit = normalizeLimit(q.limit);
  const tripType = typeof q.trip === "string" ? q.trip : null;
  const season = typeof q.season === "string" ? q.season : null;

  const cards = await getFeed({ view, tripType, season, limit });

  setHeader(
    event,
    "Cache-Control",
    "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  );
  return { cards, view, tripType, season };
});

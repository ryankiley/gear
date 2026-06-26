import { defineEventHandler, readBody, setHeader } from "h3";
import { reportList } from "../../utils/discoveryRepo";
import { assertMaxBody, rateLimit } from "../../utils/rateLimit";

// "Report list" — flag a public list for review. Sets status='hidden' (removed
// from discovery, pending review); the list + the owner's edit/share access are
// untouched. Rate-limited to slow mass-reporting. Answers generically whether or
// not anything matched, so it reveals nothing about which slugs exist.
export default defineEventHandler(async (event) => {
  setHeader(event, "X-Robots-Tag", "noindex");
  await rateLimit(event, "report", 10, 60_000);
  assertMaxBody(event, 4_000);
  const body = (await readBody(event).catch(() => ({}))) as { slug?: string };
  await reportList(typeof body?.slug === "string" ? body.slug : "");
  return { ok: true };
});

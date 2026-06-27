import { createError, defineEventHandler, getHeader, setHeader } from "h3";
import { restoreList } from "../../../utils/discoveryRepo";
import { readJsonBody } from "../../../utils/http";
import { assertMaxBody, clearReportTally, type KvStorage } from "../../../utils/rateLimit";

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

// Admin: restore a reported/flagged list to discovery (the counterpart to the
// public report endpoint). Gated on GEAR_ADMIN_TOKEN; 404 (not 403) when
// unconfigured or the token is wrong — no oracle that the route exists. Mirrors
// the catalog revert admin gate.
export default defineEventHandler(async (event) => {
  setHeader(event, "X-Robots-Tag", "noindex");
  assertMaxBody(event, 4_000);
  const admin = process.env.GEAR_ADMIN_TOKEN;
  const provided = getHeader(event, "x-admin-token");
  if (!admin || provided !== admin) throw createError({ statusCode: 404, statusMessage: "Not found" });

  const body = await readJsonBody<{ slug?: string }>(event);
  const slug = (typeof body?.slug === "string" ? body.slug : "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) throw createError({ statusCode: 400, statusMessage: "Bad request" });

  const restored = await restoreList(slug);
  // Reset the distinct-report tally so the restored list can't instantly re-flag
  // off the prior reporters.
  const storage = useStorage("kv") as unknown as KvStorage;
  await clearReportTally(storage, slug);

  return { ok: true, restored };
});

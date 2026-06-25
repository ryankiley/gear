import { createError, defineEventHandler, getQuery, getRouterParam, setHeader } from "h3";
import { getByShareCode, versionByShareCode } from "../../../utils/listRepo";

// Live-sync poll for a read-only viewer.
export default defineEventHandler(async (event) => {
  setHeader(event, "X-Robots-Tag", "noindex");
  const code = getRouterParam(event, "code") || "";
  const since = Number(getQuery(event).since) || 0;

  const version = await versionByShareCode(code);
  if (version === null) throw createError({ statusCode: 404, statusMessage: "Not found" });
  if (version <= since) return { version };
  return { version, snapshot: await getByShareCode(code) };
});

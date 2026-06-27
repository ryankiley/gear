import { createError, defineEventHandler, getQuery, setHeader } from "h3";
import { getByEditToken, versionByEditToken } from "../../utils/listRepo";
import { requireEditToken } from "../../utils/auth";

// Live-sync poll for the editor. Returns the full snapshot only when the
// server version is newer than the client's `since` (small lists → cheap).
export default defineEventHandler(async (event) => {
  setHeader(event, "X-Robots-Tag", "noindex");
  const token = requireEditToken(event);
  const since = Number(getQuery(event).since) || 0;

  const version = await versionByEditToken(token);
  if (version === null) throw createError({ statusCode: 404, statusMessage: "Not found" });
  if (version <= since) return { version };
  return { version, snapshot: await getByEditToken(token) };
});

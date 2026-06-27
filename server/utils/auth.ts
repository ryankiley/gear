import type { H3Event } from "h3";
import { createError, getHeader } from "h3";

/**
 * The edit token travels in the Authorization header (NOT the URL path), so it
 * stays out of server/platform logs and the Referer. Absent token → 401;
 * an unresolvable token → 404 at the repo layer (never 403 — no existence oracle).
 */
export function requireEditToken(event: H3Event): string {
  const header = getHeader(event, "authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw createError({ statusCode: 401, statusMessage: "Missing edit capability" });
  return token;
}

import type { H3Event } from "h3";
import { createError, getHeader } from "h3";
import { rateLimit } from "./rateLimit";
import { safeEqual } from "./tokens";

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

/**
 * Admin gate: constant-time GEAR_ADMIN_TOKEN check, 404 (not 403) when
 * unconfigured or the token is wrong — no oracle that the route exists. One
 * shared gate so the admin endpoints can't drift apart. The gate itself is
 * rate-limited so a leaked/guessed-at token can't be brute-forced unthrottled
 * (defense-in-depth on top of the constant-time compare).
 */
export async function requireAdmin(event: H3Event): Promise<void> {
  await rateLimit(event, "admin");
  const provided = getHeader(event, "x-admin-token");
  if (!safeEqual(provided, process.env.GEAR_ADMIN_TOKEN))
    throw createError({ statusCode: 404, statusMessage: "Not found" });
}

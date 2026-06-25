import { defineEventHandler, setHeader } from "h3";

// no-referrer site-wide: clicking an outbound gear/affiliate link must never
// leak the edit token (which lives in the URL fragment) via the Referer header.
export default defineEventHandler((event) => {
  setHeader(event, "Referrer-Policy", "no-referrer");
  setHeader(event, "X-Content-Type-Options", "nosniff");
});

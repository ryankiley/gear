import { createError, defineEventHandler, getRouterParam, setHeader } from "h3";
import { getByShareCode } from "../../utils/listRepo";

// Read-only view by short share code. Read capability only — there is no path
// from here to a write endpoint.
export default defineEventHandler(async (event) => {
  setHeader(event, "X-Robots-Tag", "noindex");
  const code = getRouterParam(event, "code") || "";
  const snapshot = await getByShareCode(code);
  if (!snapshot) throw createError({ statusCode: 404, statusMessage: "Not found" });
  return { snapshot };
});

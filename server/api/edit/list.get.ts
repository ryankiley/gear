import { createError, defineEventHandler, setHeader } from "h3";
import { getByEditToken } from "../../utils/listRepo";
import { requireEditToken } from "../../utils/auth";

export default defineEventHandler(async (event) => {
  setHeader(event, "X-Robots-Tag", "noindex");
  const token = requireEditToken(event);
  const snapshot = await getByEditToken(token);
  if (!snapshot) throw createError({ statusCode: 404, statusMessage: "Not found" });
  return { snapshot };
});

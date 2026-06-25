// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ["@vueuse/nuxt"],

  css: ["~/assets/styles/main.scss"],

  components: [
    // pathPrefix:false so components register without directory prefixes
    // (e.g. ItemRow, not ListItemRow) — same convention as the portfolio.
    { path: "~/components", pathPrefix: false },
  ],

  devtools: { enabled: false },

  app: {
    head: {
      htmlAttrs: { lang: "en" },
      title: "Gear — pack lists, weighed",
      meta: [
        { charset: "utf-8" },
        {
          name: "viewport",
          content:
            "width=device-width, initial-scale=1, viewport-fit=cover",
        },
        // Resolve light-dark() to the right mode on first paint (no flash).
        { name: "color-scheme", content: "light dark" },
        {
          name: "description",
          content:
            "Make a packing list, see what it weighs, share it. No login.",
        },
      ],
    },
  },

  // The editor is a client island; read views SSR. Per-route rendering is
  // tuned in a later phase (ISR feed, SSR read views, ssr:false editor).
  // For the client-first slice both routes are localStorage-driven → ssr:false.
  routeRules: {
    "/": { ssr: false },
    "/e": { ssr: false },
  },

  future: { compatibilityVersion: 4 },
});

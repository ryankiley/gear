import { defineConfig } from "vitest/config";

// shared/ logic is framework-agnostic plain TS — tested without a Nuxt env.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});

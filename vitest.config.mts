import { defineConfig } from "vitest/config";

// Scoped to src/lib/ai/usage — this milestone's only new package. Not
// wired into next.config.ts/tsconfig path aliases on purpose: test
// files import their subjects with relative paths, so no bundler
// config is needed beyond what vitest ships with by default.
export default defineConfig({
  test: {
    include: ["src/lib/ai/usage/**/*.test.ts"],
    environment: "node",
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the built site works at any GitHub Pages path.
  base: "./",
  test: {
    include: ["src/**/*.test.ts"],
  },
});

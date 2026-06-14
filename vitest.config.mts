import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

// Unit tests for the platform's pure logic (grading, parsing, tokens, economics…).
// `server-only` is stubbed so server modules can be imported in a Node context.
// `.mts` so the ESM-only tsconfig-paths plugin loads correctly.
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

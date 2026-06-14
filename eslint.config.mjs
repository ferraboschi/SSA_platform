import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // These rules target the React Compiler, which this project does NOT enable.
    // They flag the intentional, runtime-safe "latest-ref" idiom (writing a ref
    // during render to keep a stable callback) and a couple of bounded
    // derive-state-in-effect clamps. Keep them visible as warnings rather than
    // contorting correct code to satisfy a compiler we don't run.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design-reference prototype (not app code — never built or shipped).
    "_reference/**",
  ]),
]);

export default eslintConfig;

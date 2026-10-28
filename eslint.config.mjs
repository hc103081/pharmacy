import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "tests/**",
    "test-results/**",
    "mobilesam-env/**",
    "cloudflare-worker/**",
    "scripts/**",
    "supabase/**",
    "public/**",
    "*.js",
    "*.mjs",
    "vitest.setup.tsx",
  ]),
]);

export default eslintConfig;

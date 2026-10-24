import { defineConfig } from "oxlint";

import root from "../../oxlint.config.mts";

export default defineConfig({
  extends: [root],
  plugins: ["react"],
  env: {
    builtin: true,
    es2024: true,
    browser: true,
    node: true,
  },
  settings: {
    react: {
      version: "19.3.1",
    },
  },
  ignorePatterns: ["components/ui/**", "uniwind-types.d.ts"],
});

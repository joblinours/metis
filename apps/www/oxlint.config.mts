import { defineConfig } from "oxlint";

import root from "../../oxlint.config.mts";

export default defineConfig({
  extends: [root],
  plugins: ["react", "nextjs", "jsx-a11y"],
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
  overrides: [
    {
      files: ["src/components/exhibit/models/**"],
      rules: {
        "react/immutability": "off",
      },
    },
    {
      files: ["scripts/**"],
      rules: {
        "eslint/no-await-in-loop": "off",
      },
    },
  ],
});

import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "promise"],
  categories: {
    correctness: "error",
    suspicious: "error",
    perf: "warn",
  },
  env: {
    builtin: true,
    es2024: true,
    node: true,
  },
  rules: {
    "eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    "import/no-unassigned-import": [
      "error",
      {
        allow: [
          "**/*.css",
          "@/lib/orpc.server",
          "@fontsource/**",
          "@fontsource-variable/**",
          "expo-router/entry",
          "pdfjs-dist/build/pdf.worker.mjs",
          "react-native-url-polyfill/auto",
          "server-only",
        ],
      },
    ],
    "jsx-a11y/no-autofocus": "off",
    "promise/always-return": ["error", { ignoreLastCallback: true }],
    "jsx-a11y/prefer-tag-over-role": "off",
    "oxc/no-map-spread": "off",
    "react/no-danger": "error",
    "react/react-in-jsx-scope": "off",
    "typescript/consistent-return": "off",
    "typescript/no-non-null-assertion": "error",
    "unicorn/no-document-cookie": "error",
  },
});

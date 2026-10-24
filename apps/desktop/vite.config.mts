import { resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = resolve(import.meta.dirname, "renderer");
const PAGES = ["loading", "setup", "signin", "offline", "settings"];

export default defineConfig({
  root,
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(import.meta.dirname, "dist/renderer"),
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: Object.fromEntries(PAGES.map((page) => [page, resolve(root, `${page}.html`)])),
    },
  },
});

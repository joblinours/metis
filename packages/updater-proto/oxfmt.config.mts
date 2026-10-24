import { defineConfig } from "oxfmt";

import root from "../../oxfmt.config.mts";

export default defineConfig({
  ...root,
  ignorePatterns: ["src/gen/**"],
});

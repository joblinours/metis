import { defineConfig } from "oxfmt";

import root from "../../oxfmt.config.mts";

export default defineConfig({
  ...root,
  astro: true,
});

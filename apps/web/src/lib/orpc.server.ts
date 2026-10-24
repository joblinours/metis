import "server-only";
import { createRouterClient, type RouterClient } from "@orpc/server";

import { type AppRouter, router } from "@/server/routes";

declare global {
  var $orpc: RouterClient<AppRouter> | undefined;
}

export const orpc: RouterClient<AppRouter> = createRouterClient(router, {
  context: async () => ({}),
});

globalThis.$orpc = orpc;

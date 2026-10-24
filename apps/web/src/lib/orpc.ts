import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import type { AppRouter } from "@/server/routes";

declare global {
  var $orpc: RouterClient<AppRouter> | undefined;
}

const link = new RPCLink({
  url: () => {
    if (typeof window === "undefined") {
      throw new Error("RPCLink is not allowed on the server side.");
    }
    return `${window.location.origin}/rpc`;
  },
  fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
  interceptors: [
    onError((error) => {
      console.error("[orpc/client]", error);
    }),
  ],
});

export const orpc: RouterClient<AppRouter> = globalThis.$orpc ?? createORPCClient(link);

export const rpc = createTanstackQueryUtils(orpc);

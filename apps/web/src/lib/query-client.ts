import { environmentManager, QueryClient, type QueryKey } from "@tanstack/react-query";

import { isRecord } from "./guards";

const RETRY_STATUSES = new Set([429, 502, 503, 504]);

function retryOnce(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && isRecord(error) && RETRY_STATUSES.has(Number(error.status));
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: retryOnce, retryDelay: 1500, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (environmentManager.isServer()) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

async function settleThenRefetch(queryKey: QueryKey, exact: boolean) {
  const client = getQueryClient();
  const running = client
    .getQueryCache()
    .findAll({ queryKey, exact })
    .filter((query) => query.state.fetchStatus === "fetching")
    .flatMap((query) => (query.promise ? [query.promise.catch(() => {})] : []));
  await Promise.all(running);
  await client.invalidateQueries({ queryKey, exact, refetchType: "none" });
  await client.refetchQueries({ queryKey, exact, type: "active" }, { cancelRefetch: false });
}

export async function refreshQuery<TKey extends QueryKey>(queryKey: TKey) {
  await settleThenRefetch(queryKey, true);
  return getQueryClient().getQueryState(queryKey);
}

export async function refreshQueries(queryKey: QueryKey) {
  await settleThenRefetch(queryKey, false);
}

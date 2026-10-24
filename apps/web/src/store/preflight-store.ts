import { orpc, rpc } from "@/lib/orpc";
import { getQueryClient } from "@/lib/query-client";

export const preflightQuery = rpc.dashboard.system.preflight.queryOptions();

export async function acknowledgePreflight(id: number) {
  const data = await orpc.dashboard.system.acknowledgePreflight({ id });
  getQueryClient().setQueryData(preflightQuery.queryKey, data);
}

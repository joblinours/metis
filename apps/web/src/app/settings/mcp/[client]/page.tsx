import { notFound } from "next/navigation";

import { orpc } from "@/lib/orpc.server";
import { aiEnabled } from "@/services/llm";

import { ClientPage } from "./_components/client-page";

export default async function McpClientSettingsPage({
  params,
}: PageProps<"/settings/mcp/[client]">) {
  if (!aiEnabled()) notFound();

  const { client: slug } = await params;
  const [client, access] = await Promise.all([orpc.mcp.getClient({ slug }), orpc.mcp.access()]);
  if (!client) notFound();

  return <ClientPage initialClient={client} access={access} />;
}

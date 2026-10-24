import { notFound } from "next/navigation";

import { orpc } from "@/lib/orpc.server";
import { aiEnabled } from "@/services/llm";

import { McpSettings } from "./_components/mcp-settings";

export default async function McpSettingsPage() {
  if (!aiEnabled()) notFound();

  const [clients, access] = await Promise.all([orpc.mcp.listClients(), orpc.mcp.access()]);

  return <McpSettings initialClients={clients} access={access} />;
}

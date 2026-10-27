import { PageHeader } from "@/components/page-header";

import { McpView } from "./_components/mcp-view";

export default function DashboardMcpPage() {
  return (
    <div>
      <PageHeader
        title="MCP clients"
        description="Every external client registered against this instance."
      />

      <div className="mt-6">
        <McpView />
      </div>
    </div>
  );
}

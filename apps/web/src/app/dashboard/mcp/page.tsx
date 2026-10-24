import { McpView } from "./_components/mcp-view";

export default function DashboardMcpPage() {
  return (
    <div>
      <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">
        MCP clients
      </h1>
      <p className="mt-1 text-[13px] text-faint">
        Every external client registered against this instance.
      </p>

      <div className="mt-6">
        <McpView />
      </div>
    </div>
  );
}

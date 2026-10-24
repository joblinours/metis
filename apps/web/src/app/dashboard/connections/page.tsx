import { ConnectionsView } from "./_components/connections-view";

export default function DashboardConnectionsPage() {
  return (
    <div>
      <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">
        Connections
      </h1>
      <p className="mt-1 text-[13px] text-faint">
        Every grant on this instance and the resources hanging off it.
      </p>

      <div className="mt-6">
        <ConnectionsView />
      </div>
    </div>
  );
}

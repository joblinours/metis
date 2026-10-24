import { WorkspacesView } from "./_components/workspaces-view";

export default function DashboardWorkspacesPage() {
  return (
    <div>
      <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">
        Workspaces
      </h1>
      <p className="mt-1 text-[13px] text-faint">
        How the instance is split up and what each workspace carries.
      </p>

      <div className="mt-6">
        <WorkspacesView />
      </div>
    </div>
  );
}

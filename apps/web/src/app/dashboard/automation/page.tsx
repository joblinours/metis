import { AutomationView } from "./_components/automation-view";

export default function DashboardAutomationPage() {
  return (
    <div>
      <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">
        Automation
      </h1>
      <p className="mt-1 text-[13px] text-faint">Workflows and the scheduled-mail queue.</p>

      <div className="mt-6">
        <AutomationView />
      </div>
    </div>
  );
}

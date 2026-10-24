import { OverviewExtras } from "./_components/overview-extras";
import { StatCards } from "./_components/stat-cards";

export default function DashboardPage() {
  return (
    <div>
      <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">
        Overview
      </h1>
      <p className="mt-1 text-[13px] text-faint">What this instance is carrying right now.</p>

      <div className="mt-6">
        <StatCards />
        <OverviewExtras />
      </div>
    </div>
  );
}

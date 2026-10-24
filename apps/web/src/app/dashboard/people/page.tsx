import { PeopleView } from "./_components/people-view";

export default function DashboardPeoplePage() {
  return (
    <div>
      <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">People</h1>
      <p className="mt-1 text-[13px] text-faint">Accounts, invites, and how they are secured.</p>

      <div className="mt-6">
        <PeopleView />
      </div>
    </div>
  );
}

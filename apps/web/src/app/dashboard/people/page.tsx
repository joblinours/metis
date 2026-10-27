import { PageHeader } from "@/components/page-header";

import { PeopleView } from "./_components/people-view";

export default function DashboardPeoplePage() {
  return (
    <div>
      <PageHeader title="People" description="Accounts, invites, and how they are secured." />

      <div className="mt-6">
        <PeopleView />
      </div>
    </div>
  );
}

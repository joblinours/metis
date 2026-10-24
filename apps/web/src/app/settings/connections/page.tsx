import { Suspense } from "react";

import { ConnectionsList } from "./_components/connections-list";

export default function ConnectionsSettingsPage() {
  return (
    <Suspense>
      <ConnectionsList />
    </Suspense>
  );
}

import type { Metadata } from "next";

import { ScheduledView } from "./_components/scheduled-view";

export const metadata: Metadata = { title: "Scheduled" };

export default function ScheduledPage() {
  return <ScheduledView />;
}

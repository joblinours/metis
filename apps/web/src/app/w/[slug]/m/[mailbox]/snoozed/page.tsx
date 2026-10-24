import type { Metadata } from "next";

import { SnoozedView } from "./_components/snoozed-view";

export const metadata: Metadata = { title: "Snoozed" };

export default function SnoozedPage() {
  return <SnoozedView />;
}

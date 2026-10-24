import { isNativeLink } from "@/auth/native-link";
import { NativeCard } from "@/components/native-card";

import { NativeHandoff } from "./_components/native-handoff";

export default async function NativeReturnPage({ searchParams }: PageProps<"/native/return">) {
  const { to } = await searchParams;

  if (!isNativeLink(to)) {
    return <NativeCard title="Link not valid" body="Go back to the Metis app and try again." />;
  }

  return <NativeHandoff link={to} />;
}

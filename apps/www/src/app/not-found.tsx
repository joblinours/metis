import type { Metadata } from "next";

import { Button } from "@/components/site/button";
import { PageHead } from "@/components/site/page-head";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This page does not exist on the Metis Suite site.",
};

export default function NotFound() {
  return (
    <PageHead
      kicker="404"
      title={
        <>
          Nothing <em>here.</em>
        </>
      }
      text="This page does not exist. It may have moved, or the link may be wrong."
    >
      <Button href="/" kind="internal">
        Go to the home page
      </Button>
      <Button href="/pricing" tone="ghost" kind="internal">
        See pricing
      </Button>
    </PageHead>
  );
}

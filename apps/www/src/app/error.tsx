"use client";

import { useEffect } from "react";

import { Button } from "@/components/site/button";
import { PageHead } from "@/components/site/page-head";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[www] page error", error);
  }, [error]);

  return (
    <PageHead
      kicker="Error"
      title={
        <>
          Something <em>broke.</em>
        </>
      }
      text="This page failed to load. Try again, or go back to the home page."
    >
      <Button onClick={retry} kind="click">
        Try again
      </Button>
      <Button href="/" tone="ghost" kind="internal">
        Go to the home page
      </Button>
    </PageHead>
  );
}

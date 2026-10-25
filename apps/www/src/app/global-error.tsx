"use client";

import "./globals.css";
import { useEffect } from "react";

import { Button } from "@/components/site/button";
import { PageHead } from "@/components/site/page-head";
import { SITE_NAME } from "@/lib/site";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[www] root error", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>{`Something broke | ${SITE_NAME}`}</title>
        <main id="main">
          <PageHead
            kicker="Error"
            title={
              <>
                Something <em>broke.</em>
              </>
            }
            text="The site failed to load. Try again, or come back in a few minutes."
          >
            <Button onClick={retry} kind="click">
              Try again
            </Button>
          </PageHead>
        </main>
      </body>
    </html>
  );
}

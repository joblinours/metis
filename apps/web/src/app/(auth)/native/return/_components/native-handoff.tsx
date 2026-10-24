"use client";

import { Button } from "@metis/ui/components/button";
import { useEffect } from "react";

import { NativeCard } from "@/components/native-card";

export function NativeHandoff({ link }: { link: string }) {
  useEffect(() => {
    window.location.href = link;
  }, [link]);

  return (
    <NativeCard
      title="Back to the app"
      body="Metis is opening in the Metis app. If it does not open, tap the button below."
    >
      <Button
        className="h-auto w-full rounded-xl px-4 py-3"
        onClick={() => {
          window.location.href = link;
        }}
      >
        Open Metis
      </Button>
    </NativeCard>
  );
}

"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useUnsavedChangesStore } from "@/store/unsaved-changes-store";

export function GuardedLink({ onNavigate, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onNavigate={(event) => {
        onNavigate?.(event);
        const { dirty, nudge } = useUnsavedChangesStore.getState();
        if (dirty) {
          event.preventDefault();
          nudge();
        }
      }}
    />
  );
}

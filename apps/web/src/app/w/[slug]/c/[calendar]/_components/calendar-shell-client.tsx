"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

export const CalendarShellClient = dynamic(
  () => import("./calendar-shell").then((mod) => mod.CalendarShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-faint" />
      </div>
    ),
  },
);

"use client";

import { format, subDays } from "date-fns";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import { useNow } from "@/hooks/use-now";

import { CardAction, type CardActionIntent } from "./card-parts";
import { DATE_ONLY, parseWhen } from "./format";
import { useSummaryActions } from "./summary-context";

const REMIND_HOUR = 9;

function wakeTime(value: string, daysBefore: number): Date | null {
  const parsed = parseWhen(value);
  if (!parsed) return null;
  const day = subDays(parsed, daysBefore);
  if (DATE_ONLY.test(value) || daysBefore > 0) {
    day.setHours(REMIND_HOUR, 0, 0, 0);
  }
  return day;
}

export function RemindButton({
  date,
  daysBefore = 0,
  intent,
}: {
  date: string | null;
  daysBefore?: number;
  intent?: CardActionIntent;
}) {
  const actions = useSummaryActions();
  const now = useNow();
  const wakeAt = date ? wakeTime(date, daysBefore) : null;
  if (!actions || !wakeAt || wakeAt <= now) return null;

  return (
    <CardAction
      intent={intent}
      icon={BellRing}
      onClick={() => {
        actions.snooze(wakeAt);
        toast.success(`This email comes back ${format(wakeAt, "EEE, MMM d 'at' h:mm a")}`);
      }}
    >
      Remind me {format(wakeAt, "MMM d")}
    </CardAction>
  );
}

"use client";

import { Switch } from "@metis/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metis/ui/components/tooltip";
import { cn } from "@metis/ui/lib/utils";
import {
  Bot as BotNode,
  BotOff as BotOffNode,
  ShieldCheck as ShieldCheckNode,
  ShieldOff as ShieldOffNode,
} from "lucide";
import { Bot, BotOff, ShieldCheck, ShieldOff } from "lucide-react";
import type { IconNode } from "morphicons";
import { MorphIcon } from "morphicons/react";

function Mark({
  on,
  label,
  OnIcon,
  OffIcon,
}: {
  on: boolean;
  label: string;
  OnIcon: typeof Bot;
  OffIcon: typeof Bot;
}) {
  const Icon = on ? OnIcon : OffIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={label}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface",
              on ? "text-status-success" : "text-faint",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface PolicyToggleProps {
  on: boolean;
  label: string;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}

function MorphToggle({
  on,
  label,
  onNode,
  offNode,
  disabled,
  onToggle,
}: PolicyToggleProps & { onNode: IconNode; offNode: IconNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Switch
            aria-label={label}
            checked={on}
            disabled={disabled}
            onCheckedChange={onToggle}
            size="md"
            tone="success"
          >
            <MorphIcon icon={on ? onNode : offNode} size={14} spring="snappy" strokeWidth={2} />
          </Switch>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function AiMark({ on, label }: { on: boolean; label: string }) {
  return <Mark OffIcon={BotOff} OnIcon={Bot} label={label} on={on} />;
}

export function PhishingMark({ on, label }: { on: boolean; label: string }) {
  return <Mark OffIcon={ShieldOff} OnIcon={ShieldCheck} label={label} on={on} />;
}

export function AiToggle(props: PolicyToggleProps) {
  return <MorphToggle {...props} offNode={BotOffNode} onNode={BotNode} />;
}

export function PhishingToggle(props: PolicyToggleProps) {
  return <MorphToggle {...props} offNode={ShieldOffNode} onNode={ShieldCheckNode} />;
}

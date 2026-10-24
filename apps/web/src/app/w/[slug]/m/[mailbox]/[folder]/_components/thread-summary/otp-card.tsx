"use client";

import { cn } from "@metis/ui/lib/utils";
import { KeyRound } from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardShell, CopyButton } from "./card-parts";
import { ExpiryBadge, useExpiry } from "./expiry";

export function OtpCard({ props }: { props: SummaryCardProps<"Otp"> }) {
  const expiry = useExpiry(props.issuedAt, props.validForMinutes);
  return (
    <CardShell
      icon={KeyRound}
      label={props.service ? `${props.service} code` : "Verification code"}
      aside={<ExpiryBadge expiry={expiry} />}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "font-mono text-[22px] tracking-[4px] text-foreground",
            expiry.expired && "text-faint line-through",
          )}
        >
          {props.code}
        </span>
        <CopyButton
          text={props.code}
          label="Copy code"
          intent={expiry.expired ? "secondary" : "primary"}
        />
      </div>
    </CardShell>
  );
}

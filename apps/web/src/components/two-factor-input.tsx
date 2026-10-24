"use client";

import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@metis/ui/components/input-otp";
import { cn } from "@metis/ui/lib/utils";
import { REGEXP_ONLY_DIGITS } from "input-otp";

import { BACKUP_CODE_LENGTH, TOTP_CODE_LENGTH } from "@/auth/two-factor-code";
import type { TwoFactorFieldHandle } from "@/hooks/use-two-factor-code";

const SLOT = "size-11 text-base";

export function TwoFactorInput({
  field,
  disabled,
  autoFocus,
  allowBackupCode = true,
  align = "center",
  className,
}: {
  field: TwoFactorFieldHandle;
  disabled?: boolean;
  autoFocus?: boolean;
  allowBackupCode?: boolean;
  align?: "center" | "start";
  className?: string;
}) {
  const backup = allowBackupCode && field.kind === "backup";
  const centered = align === "center";

  return (
    <div
      className={cn("flex flex-col gap-2.5", centered ? "items-center" : "items-start", className)}
    >
      {backup ? (
        <Input
          value={field.value}
          onChange={(e) => field.setValue(e.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={BACKUP_CODE_LENGTH + 1}
          placeholder="abcde-12345"
          aria-label="Backup code"
          className="h-11 text-center font-mono text-base tracking-[0.2em]"
        />
      ) : (
        <InputOTP
          value={field.value}
          onChange={field.setValue}
          maxLength={TOTP_CODE_LENGTH}
          pattern={REGEXP_ONLY_DIGITS}
          aria-label="Authentication code"
          disabled={disabled}
          autoFocus={autoFocus}
          containerClassName={centered ? "justify-center" : "justify-start"}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className={SLOT} />
            <InputOTPSlot index={1} className={SLOT} />
            <InputOTPSlot index={2} className={SLOT} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} className={SLOT} />
            <InputOTPSlot index={4} className={SLOT} />
            <InputOTPSlot index={5} className={SLOT} />
          </InputOTPGroup>
        </InputOTP>
      )}

      {allowBackupCode ? (
        <Button
          variant="link"
          disabled={disabled}
          onClick={() => field.setKind(backup ? "totp" : "backup")}
          className="h-auto p-0 text-xs text-faint underline-offset-4 hover:text-muted-foreground"
        >
          {backup ? "Use your authenticator instead" : "Use a backup code instead"}
        </Button>
      ) : null}
    </div>
  );
}

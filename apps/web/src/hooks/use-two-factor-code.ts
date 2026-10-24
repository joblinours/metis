"use client";

import { useCallback, useMemo, useState } from "react";

import {
  formatBackupCode,
  formatTotpCode,
  isTwoFactorCodeComplete,
  type TwoFactorCodeKind,
} from "@/auth/two-factor-code";

export type TwoFactorFieldHandle = {
  value: string;
  kind: TwoFactorCodeKind;
  setValue: (raw: string) => void;
  setKind: (next: TwoFactorCodeKind) => void;
};

export type TwoFactorCode = {
  value: string;
  kind: TwoFactorCodeKind;
  complete: boolean;
  reset: () => void;
  field: TwoFactorFieldHandle;
};

export function useTwoFactorCode(): TwoFactorCode {
  const [value, setRawValue] = useState("");
  const [kind, setRawKind] = useState<TwoFactorCodeKind>("totp");

  const setValue = useCallback(
    (raw: string) => setRawValue(kind === "backup" ? formatBackupCode(raw) : formatTotpCode(raw)),
    [kind],
  );

  const setKind = useCallback((next: TwoFactorCodeKind) => {
    setRawKind(next);
    setRawValue("");
  }, []);

  const reset = useCallback(() => {
    setRawKind("totp");
    setRawValue("");
  }, []);

  return useMemo(
    () => ({
      value,
      kind,
      complete: isTwoFactorCodeComplete(value),
      reset,
      field: { value, kind, setValue, setKind },
    }),
    [value, kind, setValue, setKind, reset],
  );
}

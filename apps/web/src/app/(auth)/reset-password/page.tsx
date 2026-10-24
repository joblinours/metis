"use client";

import { Suspense } from "react";

import { ResetPasswordInner } from "./_components/reset-password-inner";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}

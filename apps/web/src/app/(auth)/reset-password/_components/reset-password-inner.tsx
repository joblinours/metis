"use client";

import { Button } from "@metis/ui/components/button";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { AuthInput } from "@/components/auth-input";

export function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const error_q = params.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    error_q === "invalid_token" ? "This reset link is invalid or has expired." : null,
  );
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!token) return setError("Missing reset token");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");

    setSubmitting(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result?.error) {
        setError(result.error.message ?? "Could not reset password");
        return;
      }
      setDone(true);
      setTimeout(() => router.replace("/"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Choose a new password
          </h1>
        </div>

        {done ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 text-center">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Password updated
            </h2>
            <p className="mt-1.5 text-xs text-neutral-500">Redirecting you to sign in…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label
              htmlFor="new-password"
              className="text-xs font-medium uppercase tracking-[1.5px] text-neutral-500"
            >
              New password
            </label>
            <AuthInput
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              autoFocus
              disabled={submitting}
            />
            <label
              htmlFor="confirm-password"
              className="mt-1 text-xs font-medium uppercase tracking-[1.5px] text-neutral-500"
            >
              Confirm password
            </label>
            <AuthInput
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
              disabled={submitting}
            />
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <Button
              type="submit"
              disabled={submitting || !token}
              className="mt-1 h-auto w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-900 hover:opacity-90 dark:bg-white dark:text-neutral-900 dark:hover:bg-white"
            >
              {submitting ? "Updating…" : "Update password"}
            </Button>
            <Link
              href="/"
              className="mt-2 text-center text-xs text-neutral-500 underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}

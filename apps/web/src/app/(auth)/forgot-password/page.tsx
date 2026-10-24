"use client";

import { Button } from "@metis/ui/components/button";
import Link from "next/link";
import { useState } from "react";

import { authClient } from "@/auth/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed?.includes("@")) {
      setError("Enter a valid email address");
      return;
    }

    setSubmitting(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: trimmed,
        redirectTo: "/reset-password",
      });
      if (result?.error) {
        setError(result.error.message ?? "Could not send reset email");
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 text-center">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Check your email
            </h2>
            <p className="mt-1.5 text-xs text-neutral-500">
              If an account exists for{" "}
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{email}</span>,
              you'll receive a reset link shortly. It's valid for 1 hour.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-xs text-neutral-500 underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label
              htmlFor="email"
              className="text-xs font-medium uppercase tracking-[1.5px] text-neutral-500"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              disabled={submitting}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-none focus:border-neutral-900 dark:focus:border-neutral-300 disabled:opacity-50"
            />
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <Button
              type="submit"
              disabled={submitting}
              className="mt-1 h-auto w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-900 hover:opacity-90 dark:bg-white dark:text-neutral-900 dark:hover:bg-white"
            >
              {submitting ? "Sending…" : "Send reset link"}
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

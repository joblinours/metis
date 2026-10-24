"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/auth/client";
import { orpc } from "@/lib/orpc";

import { Center } from "./center";

export function AcceptInner({ token }: { token: string }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [accepted, setStatus] = useState<"working" | "done" | "error">("working");
  const [failure, setError] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const status = token ? accepted : "error";
  const error = token
    ? failure
    : "This invite link isn't valid. Ask whoever invited you to resend it.";

  useEffect(() => {
    if (isPending || !session || !token) return;
    orpc.invites
      .accept({ token })
      .then((body) => {
        setWorkspaceName(body.workspaceName ?? "Workspace");
        setStatus("done");
        setTimeout(
          () => router.replace(body.workspaceSlug ? `/w/${body.workspaceSlug}` : "/w"),
          1500,
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not accept");
        setStatus("error");
      });
  }, [session, isPending, token, router]);

  if (isPending) {
    return (
      <Center>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
      </Center>
    );
  }

  if (!session) {
    return (
      <Center>
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 text-center">
          <h2 className="text-sm font-semibold">Sign in to accept</h2>
          <p className="mt-1.5 text-xs text-neutral-500">
            Sign in or create an account, then reopen this invite link.
          </p>
          <Link
            href={`/?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`}
            className="mt-4 inline-block rounded-xl bg-neutral-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-neutral-900"
          >
            Go to sign in
          </Link>
        </div>
      </Center>
    );
  }

  if (status === "working") {
    return (
      <Center>
        <p className="text-xs text-neutral-500">Accepting invite…</p>
      </Center>
    );
  }

  if (status === "error") {
    return (
      <Center>
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-6 text-center">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">
            Couldn't accept invite
          </h2>
          <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">{error}</p>
          <Link
            href="/w"
            className="mt-4 inline-block text-xs text-neutral-500 underline-offset-4 hover:underline"
          >
            Back to inbox
          </Link>
        </div>
      </Center>
    );
  }

  return (
    <Center>
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 text-center">
        <h2 className="text-sm font-semibold">You're in!</h2>
        <p className="mt-1.5 text-xs text-neutral-500">Welcome to {workspaceName}. Redirecting…</p>
      </div>
    </Center>
  );
}

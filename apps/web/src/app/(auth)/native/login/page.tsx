import type { Route } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isNativeChallenge, isNativeToken, nativeLoginPath } from "@/auth/native-link";
import { getAppUser } from "@/auth/session";
import { NativeCard } from "@/components/native-card";

import { NativeLoginConfirm } from "./_components/native-login-confirm";

export const dynamic = "force-dynamic";

export default async function NativeLoginPage({ searchParams }: PageProps<"/native/login">) {
  const { challenge, state } = await searchParams;

  if (!isNativeChallenge(challenge) || !isNativeToken(state)) {
    return <NativeCard title="Link not valid" body="Start signing in again from the Metis app." />;
  }

  const appUser = await getAppUser(await headers());
  if (!appUser) {
    const next = nativeLoginPath(challenge, state);
    redirect(`/?next=${encodeURIComponent(next)}` as Route);
  }

  if (!appUser.twoFactorEnabled) {
    return (
      <NativeCard
        title="Set up two-factor first"
        body="Your account needs two-factor authentication before it can sign in to the Metis app. Set it up, then start signing in again from the app."
      >
        <Link
          href="/2fa/setup"
          className="text-sm font-medium text-neutral-900 underline-offset-4 hover:underline dark:text-neutral-100"
        >
          Set up two-factor authentication
        </Link>
      </NativeCard>
    );
  }

  return <NativeLoginConfirm email={appUser.user.email} challenge={challenge} state={state} />;
}

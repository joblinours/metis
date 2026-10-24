import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { nativeOpenLink, nativeReturnPath } from "@/auth/native-link";
import { getAppUser } from "@/auth/session";
import { config } from "@/config";
import {
  attachCalendar,
  attachDrive,
  attachMailbox,
  getCalendarLink,
  getDriveLink,
  getDriver,
  getMailboxLink,
  isConnectionProvider,
  upsertCalendar,
  upsertConnection,
  upsertDrive,
  upsertMailbox,
} from "@/connections";
import {
  connectionsCallbackUrl,
  connectionsErrorPath,
  decodeOAuthState,
  nonceCookieName,
} from "@/connections/oauth-state";
import { getWorkspaceBySlug } from "@/workspace";
import { mailPath, workspaceSettingsPath } from "@/workspace/path";

function redirectTo(path: string, native: boolean, clearNonce?: string) {
  const target = native ? nativeReturnPath(nativeOpenLink(path)) : path;
  const response = NextResponse.redirect(`${config.auth.url}${target}`);
  if (clearNonce) response.cookies.delete(nonceCookieName(clearNonce));
  return response;
}

function redirectError(message: string, clearNonce?: string, native = false) {
  console.error("[connections-callback] error:", message);
  return redirectTo(connectionsErrorPath(message), native, clearNonce);
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/connections/[provider]/callback">,
) {
  const { provider } = await params;
  if (!isConnectionProvider(provider)) {
    return redirectError(`Unknown provider: ${provider}`);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = decodeOAuthState(url.searchParams.get("state"), provider);
  const native = Boolean(state?.nativeUserId);

  const userId = state?.nativeUserId ?? (await getAppUser(request.headers))?.userId;
  if (!userId) {
    return redirectError("You must be signed in before connecting an account");
  }

  if (!state) {
    return redirectError("State mismatch — possible CSRF, please retry");
  }

  const cookieStore = await cookies();
  const issuedNonce = cookieStore.get(nonceCookieName(state.nonce))?.value;
  if (issuedNonce !== state.nonce) {
    return redirectError("State mismatch — possible CSRF, please retry", undefined, native);
  }

  if (!code) {
    return redirectError("Missing OAuth code from provider", state.nonce, native);
  }

  const driver = getDriver(provider);
  if (driver.kind !== "oauth") {
    return redirectError(
      `${driver.label} accounts do not use an OAuth callback`,
      state.nonce,
      native,
    );
  }
  const redirectUri = connectionsCallbackUrl(provider);

  let dest = state.callbackURL;
  let mismatch: string | null = null;
  try {
    const token = await driver.exchangeCode({
      code,
      redirectUri,
      query: url.searchParams,
      resources: state.resources,
    });
    const profile = await driver.getProfile(token);
    const account = await upsertConnection({
      userId,
      provider,
      profile,
      token,
    });
    console.log(
      `[connections-callback] connected ${provider} ${state.resource} for user ${userId} → ${account.connectionId}`,
    );

    if (state.expect && state.expect.accountId !== profile.providerAccountId) {
      console.warn(
        `[connections-callback] account mismatch on ${provider} for user ${userId}: expected ${state.expect.accountId}, got ${profile.providerAccountId}`,
      );
      mismatch = `Connected ${profile.email}. You started from ${state.expect.email}, so this is a separate account.`;
    }

    const target = state.attachWorkspaceSlug
      ? await getWorkspaceBySlug(userId, state.attachWorkspaceSlug)
      : null;

    if (state.resource === "calendar") {
      const cal = await upsertCalendar(account);
      if (target) {
        const existing = await getCalendarLink(cal.id, target.id);
        if (!existing) {
          await attachCalendar({
            calendarId: cal.id,
            email: cal.email,
            workspaceId: target.id,
          });
        }
        dest = workspaceSettingsPath(target.slug, "calendars");
      }
    } else if (state.resource === "drive") {
      const disk = await upsertDrive(account);
      if (target) {
        const existing = await getDriveLink(disk.id, target.id);
        if (!existing) {
          await attachDrive({
            driveId: disk.id,
            email: disk.email,
            workspaceId: target.id,
          });
        }
        dest = workspaceSettingsPath(target.slug, "drives");
      }
    } else {
      const box = await upsertMailbox(account);
      if (target) {
        const existing = await getMailboxLink(box.id, target.id);
        const slug =
          existing?.slug ??
          (
            await attachMailbox({
              mailboxId: box.id,
              email: box.email,
              workspaceId: target.id,
            })
          ).slug;
        dest = mailPath(target.slug, slug, "inbox");
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return redirectError(message.slice(0, 200), state.nonce, native);
  }

  const destination = new URL(dest, config.auth.url);
  if (mismatch) destination.searchParams.set("warning", mismatch);

  return redirectTo(`${destination.pathname}${destination.search}`, native, state.nonce);
}

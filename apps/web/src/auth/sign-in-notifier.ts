import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import { keysOf } from "@/lib/guards";

const SIGN_IN_METHODS = {
  "/sign-in/email": "password",
  "/magic-link/verify": "magic-link",
  "/two-factor/verify-totp": "totp",
  "/two-factor/verify-backup-code": "backup-code",
  "/native/exchange": "native-app",
} as const;

export type SignInMethod = (typeof SIGN_IN_METHODS)[keyof typeof SIGN_IN_METHODS];

export interface CompletedSignIn {
  userId: string;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  at: Date;
  method: SignInMethod;
}

const SECOND_FACTOR_METHODS = new Set<SignInMethod>(["totp", "backup-code"]);

function signInMethod(path: string | undefined): SignInMethod | null {
  const known = keysOf(SIGN_IN_METHODS).find((key) => key === path);
  return known ? SIGN_IN_METHODS[known] : null;
}

export const signInNotifier = (onSignIn: (signIn: CompletedSignIn) => Promise<void>) =>
  ({
    id: "metis-sign-in-notifier",
    hooks: {
      after: [
        {
          matcher: (ctx) => signInMethod(ctx.path) !== null,
          handler: createAuthMiddleware(async (ctx) => {
            const method = signInMethod(ctx.path);
            const created = ctx.context.newSession;
            if (!method || !created) return;
            if (SECOND_FACTOR_METHODS.has(method)) {
              const signedIn = await ctx.getSignedCookie(
                ctx.context.authCookies.sessionToken.name,
                ctx.context.secret,
              );
              if (signedIn) return;
            }
            await onSignIn({
              userId: created.user.id,
              email: created.user.email,
              ipAddress: created.session.ipAddress ?? null,
              userAgent: created.session.userAgent ?? null,
              at: created.session.createdAt,
              method,
            });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

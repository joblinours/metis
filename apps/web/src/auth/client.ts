"use client";

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import {
  inferAdditionalFields,
  jwtClient,
  magicLinkClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { Auth } from "./server";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<Auth>(),
    oauthProviderClient(),
    magicLinkClient(),
    twoFactorClient({
      onTwoFactorRedirect: () => {
        window.location.href = "/2fa/verify";
      },
    }),
    jwtClient(),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;

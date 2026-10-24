import { redirect } from "next/navigation";
import { Suspense } from "react";

import { legalConfig } from "@/auth/legal-consent";
import { hasAnyUser } from "@/auth/signup";
import { getInstanceConfig } from "@/config/runtime";

import { SignInInner } from "./_components/sign-in-inner";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const hasUser = await hasAnyUser();
  if (!hasUser) redirect("/setup");

  return (
    <Suspense fallback={null}>
      <SignInInner
        signupDisabled={getInstanceConfig().signup.signupDisabled}
        legal={legalConfig()}
      />
    </Suspense>
  );
}

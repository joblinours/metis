import { legalConfig } from "@/auth/legal-consent";
import { orpc } from "@/lib/orpc.server";

import { InviteSignupInner } from "./_components/invite-signup-inner";
import { InviteUnavailable } from "./_components/invite-unavailable";

export default async function InviteSignupPage(props: PageProps<"/invite/signup">) {
  const { token } = await props.searchParams;

  if (typeof token !== "string" || !token) {
    return (
      <InviteUnavailable message="This invite link isn't valid. Ask whoever invited you to resend it." />
    );
  }

  let invitedEmail: string;
  try {
    ({ email: invitedEmail } = await orpc.signup.invitePreview({ token }));
  } catch (err) {
    return (
      <InviteUnavailable
        message={err instanceof Error ? err.message : "This invite link is no longer valid"}
      />
    );
  }

  return <InviteSignupInner token={token} invitedEmail={invitedEmail} legal={legalConfig()} />;
}

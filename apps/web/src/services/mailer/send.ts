import { render, toPlainText } from "@react-email/render";
import type { ReactElement } from "react";

import { MetisSuiteTemplate } from "@/emails/metis-suite-template";

import { getMailer } from "./registry";

const plainTextOptions = {
  selectors: [{ selector: "h1", options: { uppercase: false } }],
};

async function deliver(opts: { to: string; from: string; subject: string; email: ReactElement }) {
  const html = await render(opts.email);
  await getMailer().send({
    to: opts.to,
    from: opts.from,
    subject: opts.subject,
    html,
    text: toPlainText(html, plainTextOptions),
  });
}

export async function sendMagicLinkEmail(opts: { to: string; url: string }) {
  await deliver({
    to: opts.to,
    from: getMailer().fromAuth,
    subject: "Sign in to Metis Suite",
    email: MetisSuiteTemplate({
      preview: "Sign in to Metis Suite",
      heading: "Sign in to Metis Suite",
      intro: "Click the button below to sign in to your account.",
      buttonLabel: "Sign in to Metis Suite",
      url: opts.url,
      expiry: "This link expires in 15 minutes and can only be used once.",
    }),
  });
}

export async function sendVerificationEmail(opts: { to: string; url: string }) {
  await deliver({
    to: opts.to,
    from: getMailer().fromAuth,
    subject: "Verify your Metis Suite email",
    email: MetisSuiteTemplate({
      preview: "Verify your Metis Suite email",
      heading: "Verify your email",
      intro:
        "Welcome to Metis Suite. Confirm this is your email address, then sign in again to finish setting up your account.",
      buttonLabel: "Verify email",
      url: opts.url,
      expiry: "This link expires in 1 hour.",
      footer: "Didn't sign up? You can safely ignore this email.",
    }),
  });
}

export async function sendWorkspaceInviteEmail(opts: {
  to: string;
  url: string;
  workspaceName: string;
  inviterName: string;
}) {
  await deliver({
    to: opts.to,
    from: getMailer().fromInvite,
    subject: `${opts.inviterName} invited you to ${opts.workspaceName} on Metis Suite`,
    email: MetisSuiteTemplate({
      preview: `${opts.inviterName} invited you to ${opts.workspaceName}`,
      heading: `Join ${opts.workspaceName}`,
      intro: "You've been invited to collaborate on Metis Suite.",
      details: [
        { label: "Invited by", value: opts.inviterName },
        { label: "Workspace", value: opts.workspaceName },
      ],
      buttonLabel: "Accept invite",
      url: opts.url,
      expiry: "This invite expires in 7 days.",
      footer:
        "Didn't expect this invite? You can safely ignore it — nothing will be added to your account.",
    }),
  });
}

export async function sendSignupInviteEmail(opts: {
  to: string;
  url: string;
  inviterName: string;
}) {
  await deliver({
    to: opts.to,
    from: getMailer().fromInvite,
    subject: `${opts.inviterName} invited you to Metis Suite`,
    email: MetisSuiteTemplate({
      preview: `${opts.inviterName} invited you to Metis Suite`,
      heading: "You're invited to Metis Suite",
      intro: "Pick a password and your account is ready — no other setup needed.",
      details: [{ label: "Invited by", value: opts.inviterName }],
      buttonLabel: "Create your account",
      url: opts.url,
      expiry: "This invite expires in 7 days.",
      footer: "Didn't expect this invite? You can safely ignore it — no account will be created.",
    }),
  });
}

export async function sendSignInAlertEmail(opts: {
  to: string;
  url: string;
  when: string;
  device: string;
  ipAddress: string;
  method: string;
}) {
  await deliver({
    to: opts.to,
    from: getMailer().fromAuth,
    subject: "New sign-in to your Metis Suite account",
    email: MetisSuiteTemplate({
      preview: `New sign-in from ${opts.device}`,
      heading: "New sign-in to your account",
      intro:
        "Someone just signed in to your Metis Suite account. If this was you, there's nothing to do.",
      details: [
        { label: "Account", value: opts.to },
        { label: "When", value: opts.when },
        { label: "Device", value: opts.device },
        { label: "IP address", value: opts.ipAddress },
        { label: "Signed in with", value: opts.method },
      ],
      buttonLabel: "Review your sessions",
      url: opts.url,
      footer:
        "Wasn't you? Change your password in Settings → Security, then sign out your other sessions. You can turn these emails off in Settings → Security.",
    }),
  });
}

export async function sendResetPasswordEmail(opts: { to: string; url: string }) {
  await deliver({
    to: opts.to,
    from: getMailer().fromAuth,
    subject: "Reset your Metis Suite password",
    email: MetisSuiteTemplate({
      preview: "Reset your Metis Suite password",
      heading: "Reset your password",
      intro:
        "We received a request to reset your Metis Suite password. Choose a new one with the button below.",
      buttonLabel: "Reset password",
      url: opts.url,
      expiry: "This link expires in 1 hour.",
      footer:
        "Didn't request a password reset? You can safely ignore this email — your password won't change.",
    }),
  });
}

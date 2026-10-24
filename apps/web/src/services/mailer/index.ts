export { getMailer, warnIfMailUndelivered } from "./registry";
export {
  sendMagicLinkEmail,
  sendResetPasswordEmail,
  sendSignInAlertEmail,
  sendSignupInviteEmail,
  sendVerificationEmail,
  sendWorkspaceInviteEmail,
} from "./send";
export type { Mailer, MailSenderDriver, MailSenderKind, SendMailInput } from "./types";
export { NOOP_DISABLED_FLOWS } from "./types";

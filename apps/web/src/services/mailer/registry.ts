import "server-only";
import { getInstanceConfig, sectionCached } from "@/config/runtime";
import type { MailerConfig } from "@/config/schema";

import { createConsoleDriver } from "./drivers/console";
import { createLogDriver } from "./drivers/log";
import { createNoopDriver } from "./drivers/noop";
import { createResendDriver } from "./drivers/resend";
import { createSmtpDriver } from "./drivers/smtp";
import type { Mailer } from "./types";
import { NOOP_DISABLED_FLOWS } from "./types";

function buildMailer(cfg: MailerConfig): Mailer {
  const driver = (() => {
    switch (cfg.driver) {
      case "resend":
        return createResendDriver(cfg);
      case "smtp":
        return createSmtpDriver(cfg);
      case "console":
        return createConsoleDriver(cfg);
      case "noop":
        return createNoopDriver();
      case "log":
        return createLogDriver();
    }
  })();
  return { ...driver, fromAuth: cfg.fromAuth, fromInvite: cfg.fromInvite };
}

export const getMailer: () => Mailer = sectionCached(["mailer"], (cfg) => buildMailer(cfg.mailer));

export function warnIfMailUndelivered() {
  const flows = NOOP_DISABLED_FLOWS.join(", ");
  const { driver } = getInstanceConfig().mailer;
  if (driver === "noop") {
    console.warn(
      `[mailer] the mail driver is noop — transactional email is disabled (${flows}). Choose resend or smtp to enable these flows.`,
    );
    return;
  }
  if (driver === "log") {
    console.warn(
      `[mailer] the mail driver is log — transactional email is written to the console, not delivered (${flows}).`,
    );
  }
}

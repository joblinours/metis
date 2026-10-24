import "server-only";
import { Resend } from "resend";

import type { ResendMailerConfig } from "@/config/schema";

import type { MailSenderDriver } from "../types";

export function createResendDriver(cfg: ResendMailerConfig): MailSenderDriver {
  const resend = new Resend(cfg.apiKey);

  return {
    async send(input) {
      const result = await resend.emails.send({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      if (result.error) {
        throw new Error(`Resend error: ${result.error.message ?? "unknown"}`);
      }
    },
  };
}

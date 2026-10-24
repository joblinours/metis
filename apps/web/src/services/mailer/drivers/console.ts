import "server-only";
import type { ConsoleMailerConfig } from "@/config/schema";

import type { MailSenderDriver } from "../types";

const SEND_TIMEOUT_MS = 15_000;

export function createConsoleDriver(cfg: ConsoleMailerConfig): MailSenderDriver {
  return {
    async send(input) {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: input.to,
          from: input.from,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`Console mail error: the console answered ${res.status}`);
      }
    },
  };
}

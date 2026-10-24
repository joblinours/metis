import "server-only";
import type { MailSenderDriver } from "../types";

export function createLogDriver(): MailSenderDriver {
  return {
    async send(input) {
      console.log(
        `[mailer/log]
From: ${input.from}
To: ${input.to}
Subject: ${input.subject}


${input.text}`,
      );
    },
  };
}

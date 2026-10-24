import "server-only";
import type { MailSenderDriver } from "../types";

export function createNoopDriver(): MailSenderDriver {
  return {
    async send() {},
  };
}

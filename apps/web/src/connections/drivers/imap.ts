import { imapVerifySmtp } from "@/mail/providers/imap";
import { verifyImap } from "@/mail/providers/imap-pool";

import { createCredentialDriver } from "./credential";

export const imapDriver = createCredentialDriver({
  provider: "imap",
  label: "IMAP",
  async verify(credentials) {
    await verifyImap(credentials);
    await imapVerifySmtp(credentials);
  },
});

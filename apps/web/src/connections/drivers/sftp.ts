import { sftpVerify } from "@/drive/providers/sftp";

import { createCredentialDriver } from "./credential";

export const sftpDriver = createCredentialDriver({
  provider: "sftp",
  label: "SFTP",
  async verify(credentials) {
    await sftpVerify(credentials);
  },
  accountKey: (credentials) => `${credentials.user}|${credentials.root ?? ""}`,
});

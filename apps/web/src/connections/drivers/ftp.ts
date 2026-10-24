import { ftpVerify } from "@/drive/providers/ftp";

import { createCredentialDriver } from "./credential";

export const ftpDriver = createCredentialDriver({
  provider: "ftp",
  label: "FTP",
  async verify(credentials) {
    await ftpVerify(credentials);
  },
  accountKey: (credentials) => `${credentials.user}|${credentials.root ?? ""}`,
});

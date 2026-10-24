import { webdavVerify } from "@/drive/providers/webdav";

import { createCredentialDriver } from "./credential";

export const webdavDriver = createCredentialDriver({
  provider: "webdav",
  label: "WebDAV",
  async verify(credentials) {
    await webdavVerify(credentials);
  },
  accountKey: (credentials) => `${credentials.user}|${credentials.root ?? ""}`,
});

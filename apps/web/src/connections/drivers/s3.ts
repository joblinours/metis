import { config } from "@/config";
import { s3Verify } from "@/drive/providers/s3";

import { createCredentialDriver } from "./credential";

export const s3Driver = createCredentialDriver({
  provider: "s3",
  label: "S3 storage",
  async verify(credentials) {
    await s3Verify(credentials, config.auth.url);
  },
  accountKey: (credentials) => `${credentials.bucket}|${credentials.prefix ?? ""}`,
});

import { caldavVerify } from "@/calendar/providers/caldav";

import { createCredentialDriver } from "./credential";

export const caldavDriver = createCredentialDriver({
  provider: "caldav",
  label: "CalDAV",
  async verify(credentials) {
    await caldavVerify(credentials);
  },
});

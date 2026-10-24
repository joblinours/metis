import { readFile } from "node:fs/promises";

import { ImapFlow } from "imapflow";

export const LATE_ARRIVAL_SUBJECT = "Please sign the venue contract by Friday";
export const LATE_ARRIVAL_WORKFLOW = "Triage new mail";

const FIXTURE = new URL("../seed/fixtures/mail/late-arrival/late-arrival.eml", import.meta.url);
const ARRIVAL = new Date("2026-09-27T09:00:00Z");

export interface ImapLogin {
  host: string;
  port: number;
  user: string;
  pass: string;
}

async function withInbox<T>(login: ImapLogin, run: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: login.host,
    port: login.port,
    secure: false,
    auth: { user: login.user, pass: login.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.logout();
  }
}

export async function appendLateArrival(login: ImapLogin): Promise<void> {
  const raw = (await readFile(FIXTURE, "utf8")).replace(/\r?\n/g, "\r\n");
  await withInbox(login, (client) => client.append("INBOX", raw, [], ARRIVAL));
}

export async function deleteLateArrival(login: ImapLogin): Promise<void> {
  await withInbox(login, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ subject: LATE_ARRIVAL_SUBJECT }, { uid: true });
      if (uids && uids.length > 0) {
        await client.messageDelete(uids, { uid: true });
      }
    } finally {
      lock.release();
    }
  });
}

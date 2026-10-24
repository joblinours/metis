import { readdir } from "node:fs/promises";

import { ImapFlow } from "imapflow";

import { MAIL_CASES } from "./edge/mail-cases";
import { edgeEnabled, reject } from "./report";

const FOLDERS = ["Sent", "Drafts", "Trash", "Archive", "Junk"];
const FIXTURES = new URL("./fixtures/mail/", import.meta.url);
const EDGE_ARRIVAL = Date.UTC(2026, 8, 1);

export interface ImapTarget {
  host: string;
  port: number;
  user: string;
  pass: string;
}

function dateHeader(raw: string): Date | undefined {
  const match = raw.match(/^Date:\s*(.+)$/im);
  const parsed = match?.[1] ? new Date(match[1]) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
}

export async function seedMail(target: ImapTarget): Promise<void> {
  const client = new ImapFlow({
    host: target.host,
    port: target.port,
    secure: false,
    auth: { user: target.user, pass: target.pass },
    logger: false,
  });
  await client.connect();
  try {
    const existing = new Set((await client.list()).map((box) => box.path));
    for (const folder of FOLDERS) {
      if (!existing.has(folder)) await client.mailboxCreate(folder);
    }

    const status = await client.status("INBOX", { messages: true });
    const messages = status === false ? 0 : (status.messages ?? 0);
    if (messages > 0) {
      console.log(`[seed] INBOX already has ${messages} messages`);
      return;
    }

    if (edgeEnabled()) {
      let appended = 0;
      for (const edge of MAIL_CASES) {
        try {
          const built = edge.build();
          for (const raw of Array.isArray(built) ? built : [built]) {
            await client.append("INBOX", raw, [], new Date(EDGE_ARRIVAL + appended * 1000));
            appended++;
          }
        } catch (err) {
          reject("imap", edge.name, err);
        }
      }
      console.log(`[seed] appended ${appended} edge-case messages (${MAIL_CASES.length} cases)`);
    }

    const files = (await readdir(FIXTURES)).filter((f) => f.endsWith(".eml"));
    for (const file of files.toSorted()) {
      const raw = await Bun.file(new URL(file, FIXTURES)).text();
      const eml = raw.replace(/\r?\n/g, "\r\n");
      await client.append("INBOX", eml, [], dateHeader(raw));
    }
    console.log(`[seed] appended ${files.length} messages to INBOX`);
  } finally {
    await client.logout();
  }
}

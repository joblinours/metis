import SftpClient from "ssh2-sftp-client";

import type { FileSink } from "../files";

export interface SftpTarget {
  host: string;
  port: number;
  user: string;
  pass: string;
  root: string;
}

const READY_ATTEMPTS = 60;
const READY_DELAY_MS = 1000;

async function connect(target: SftpTarget): Promise<SftpClient> {
  for (let attempt = 1; ; attempt++) {
    const client = new SftpClient("e2e-seed", {
      error: () => {},
      end: () => {},
      close: () => {},
    });
    try {
      await client.connect({
        host: target.host,
        port: target.port,
        username: target.user,
        password: target.pass,
        readyTimeout: 20_000,
      });
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      if (attempt >= READY_ATTEMPTS) throw err;
      await Bun.sleep(READY_DELAY_MS);
    }
  }
}

export async function sftpSink(target: SftpTarget): Promise<FileSink> {
  const client = await connect(target);
  const root = `${await client.cwd()}/${target.root.replace(/^\/+|\/+$/g, "")}`;
  const folders = new Map<string, Promise<void>>();

  function ensureFolder(folder: string): Promise<void> {
    if (!folder) return Promise.resolve();
    const known = folders.get(folder);
    if (known) return known;
    const pending = client.mkdir(`${root}/${folder}`, true).then(() => undefined);
    folders.set(folder, pending);
    return pending;
  }

  return {
    area: "sftp",
    label: `sftp ${target.host}:${target.port}${root}`,
    async put(key, body) {
      if (key.endsWith("/")) {
        await ensureFolder(key.slice(0, -1));
        return;
      }
      await ensureFolder(key.slice(0, Math.max(key.lastIndexOf("/"), 0)));
      await client.put(Buffer.from(body), `${root}/${key}`);
    },
    async close() {
      await client.end().catch(() => {});
    },
  };
}

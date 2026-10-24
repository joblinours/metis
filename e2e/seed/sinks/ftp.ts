import { Readable } from "node:stream";

import { Client } from "basic-ftp";

import type { FileSink } from "../files";

export interface FtpTarget {
  host: string;
  port: number;
  user: string;
  pass: string;
}

const CONNECTIONS = 2;
const READY_ATTEMPTS = 90;
const READY_DELAY_MS = 2000;

async function connect(target: FtpTarget): Promise<Client> {
  for (let attempt = 1; ; attempt++) {
    const client = new Client(30_000);
    try {
      await client.access({
        host: target.host,
        port: target.port,
        user: target.user,
        password: target.pass,
      });
      return client;
    } catch (err) {
      client.close();
      if (attempt >= READY_ATTEMPTS) throw err;
      await Bun.sleep(READY_DELAY_MS);
    }
  }
}

export async function ftpSink(target: FtpTarget): Promise<FileSink> {
  const clients: Client[] = [];
  for (let i = 0; i < CONNECTIONS; i++) clients.push(await connect(target));
  const lanes = clients.map((client) => ({ client, queue: Promise.resolve() }));
  const folders = new Set<string>();
  let next = 0;

  function onClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const lane = lanes[next++ % lanes.length];
    if (!lane) throw new Error("[seed] no FTP connection is open");
    const result = lane.queue.then(() => run(lane.client));
    lane.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function ensureFolder(client: Client, folder: string): Promise<void> {
    if (!folder || folders.has(folder)) return;
    await client.ensureDir(`/${folder}`);
    await client.cd("/");
    folders.add(folder);
  }

  return {
    area: "ftp",
    label: `ftp ${target.host}:${target.port}`,
    async put(key, body) {
      await onClient(async (client) => {
        if (key.endsWith("/")) {
          await ensureFolder(client, key.slice(0, -1));
          return;
        }
        await ensureFolder(client, key.slice(0, Math.max(key.lastIndexOf("/"), 0)));
        await client.uploadFrom(Readable.from([Buffer.from(body)]), `/${key}`);
      });
    },
    async close() {
      for (const client of clients) client.close();
    },
  };
}

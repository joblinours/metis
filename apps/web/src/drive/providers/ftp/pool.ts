import crypto from "node:crypto";
import { isIP } from "node:net";

import { Client, FTPError } from "basic-ftp";

import type { FtpCredentials } from "@/connections/types";
import { createConnectionPools } from "@/drive/connection-pool";

const SOCKET_TIMEOUT_MS = 60_000;

interface FtpConnection {
  client: Client;
  home: string;
}

export interface FtpLease {
  client: Client;
  home: string;
  release: () => void;
  discard: () => void;
}

const pools = createConnectionPools<FtpConnection>({
  close: (connection) => connection.client.close(),
  isClosed: (connection) => connection.client.closed,
});

export function retireFtpServers(keep: (serverId: string) => boolean): void {
  for (const server of pools.servers()) {
    if (!keep(server)) pools.retire(server);
  }
}

function loginOf(credentials: FtpCredentials): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        credentials.host,
        credentials.port,
        credentials.secure,
        credentials.allowInsecureTls,
        credentials.user,
        credentials.pass,
      ]),
    )
    .digest("hex");
}

async function connect(credentials: FtpCredentials): Promise<FtpConnection> {
  const client = new Client(SOCKET_TIMEOUT_MS);
  try {
    await client.access({
      host: credentials.host,
      port: credentials.port,
      user: credentials.user,
      password: credentials.pass,
      secure:
        credentials.secure === "none"
          ? false
          : credentials.secure === "implicit"
            ? "implicit"
            : true,
      secureOptions: {
        ...(isIP(credentials.host) ? {} : { servername: credentials.host }),
        rejectUnauthorized: !credentials.allowInsecureTls,
      },
    });
    return { client, home: await client.pwd() };
  } catch (err) {
    client.close();
    throw err;
  }
}

export async function acquireFtp(
  credentials: FtpCredentials,
  signal?: AbortSignal,
): Promise<FtpLease> {
  const lease = await pools.acquire(
    {
      server: credentials.serverId,
      login: loginOf(credentials),
      size: credentials.poolSize,
      connect: () => connect(credentials),
    },
    signal,
  );
  return {
    client: lease.connection.client,
    home: lease.connection.home,
    release: lease.release,
    discard: lease.discard,
  };
}

export async function withFtp<T>(
  credentials: FtpCredentials,
  run: (lease: FtpLease) => Promise<T>,
): Promise<T> {
  const held = await acquireFtp(credentials);
  try {
    const result = await run(held);
    held.release();
    return result;
  } catch (err) {
    if (err instanceof FTPError && !held.client.closed) held.release();
    else held.discard();
    throw err;
  }
}

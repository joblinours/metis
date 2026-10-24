import crypto from "node:crypto";

import Client from "ssh2-sftp-client";

import type { SftpCredentials } from "@/connections/types";
import { createConnectionPools } from "@/drive/connection-pool";

const READY_TIMEOUT_MS = 20_000;

export class HostKeyMismatchError extends Error {}

export interface SftpSession {
  client: Client;
  home: string;
  closed: boolean;
}

export interface SftpLease {
  session: SftpSession;
  release: () => void;
  discard: () => void;
}

const pools = createConnectionPools<SftpSession>({
  close: (session) => {
    session.closed = true;
    session.client.end().catch(() => {});
  },
  isClosed: (session) => session.closed,
});

export function hostKeyFingerprint(key: Buffer): string {
  return crypto.createHash("sha256").update(key).digest("base64").replace(/=+$/, "");
}

export function retireSftpServers(keep: (serverId: string) => boolean): void {
  for (const server of pools.servers()) {
    if (!keep(server)) pools.retire(server);
  }
}

function loginOf(credentials: SftpCredentials): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        credentials.host,
        credentials.port,
        credentials.hostKeySha256,
        credentials.user,
        credentials.pass,
      ]),
    )
    .digest("hex");
}

async function connect(credentials: SftpCredentials): Promise<SftpSession> {
  const hostKey: { presented: string | null } = { presented: null };
  let closed = false;
  const markClosed = () => {
    closed = true;
    if (session) session.closed = true;
  };
  let session: SftpSession | null = null;
  const client = new Client("metis", {
    error: markClosed,
    end: markClosed,
    close: markClosed,
  });

  try {
    await client.connect({
      host: credentials.host,
      port: credentials.port,
      username: credentials.user,
      password: credentials.pass,
      readyTimeout: READY_TIMEOUT_MS,
      hostVerifier: (key: Buffer) => {
        hostKey.presented = hostKeyFingerprint(key);
        return hostKey.presented === credentials.hostKeySha256;
      },
    });
    session = { client, home: await client.cwd(), closed };
    return session;
  } catch (err) {
    await client.end().catch(() => {});
    const { presented } = hostKey;
    if (presented && presented !== credentials.hostKeySha256) {
      throw new HostKeyMismatchError(
        `The server presented host key SHA256:${presented}, not the one configured for this server — refusing to connect`,
      );
    }
    throw err;
  }
}

export async function acquireSftp(
  credentials: SftpCredentials,
  signal?: AbortSignal,
): Promise<SftpLease> {
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
    session: lease.connection,
    release: lease.release,
    discard: lease.discard,
  };
}

export async function withSftp<T>(
  credentials: SftpCredentials,
  run: (session: SftpSession) => Promise<T>,
): Promise<T> {
  const held = await acquireSftp(credentials);
  try {
    return await run(held.session);
  } finally {
    held.release();
  }
}

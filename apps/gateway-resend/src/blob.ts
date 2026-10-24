import { AwsClient } from "aws4fetch";

import { sql } from "./db";
import { type BlobConfig, env } from "./env";

export interface StoredBlob {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string | null;
}

interface BlobStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredBlob | null>;
  delete(keys: string[]): Promise<void>;
}

function postgresStore(): BlobStore {
  return {
    async put(key, bytes, contentType) {
      await sql`
        INSERT INTO blobs (key, content_type, bytes)
        VALUES (${key}, ${contentType}, ${Buffer.from(bytes)})
        ON CONFLICT (key) DO UPDATE SET
          content_type = excluded.content_type,
          bytes = excluded.bytes
      `;
    },

    async get(key) {
      const rows = await sql<{ content_type: string | null; bytes: Buffer }[]>`
        SELECT content_type, bytes FROM blobs WHERE key = ${key}
      `;
      const row = rows[0];
      if (!row) return null;
      return {
        bytes: new Uint8Array(row.bytes),
        contentType: row.content_type,
      };
    },

    async delete(keys) {
      if (keys.length === 0) return;
      await sql`DELETE FROM blobs WHERE key = ANY(${keys})`;
    },
  };
}

function s3Store(cfg: BlobConfig): BlobStore {
  const client = new AwsClient({
    accessKeyId: cfg.keyId,
    secretAccessKey: cfg.secret,
    region: cfg.region,
    service: "s3",
  });
  const url = (key: string) =>
    `${cfg.endpoint}/${cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  return {
    async put(key, bytes, contentType) {
      const res = await client.fetch(url(key), {
        method: "PUT",
        body: bytes,
        headers: { "Content-Type": contentType },
      });
      if (!res.ok) {
        throw new Error(`blob store rejected PUT ${key}: ${res.status}`);
      }
    },

    async get(key) {
      const res = await client.fetch(url(key));
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`blob store rejected GET ${key}: ${res.status}`);
      }
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get("content-type"),
      };
    },

    async delete(keys) {
      await Promise.all(
        keys.map(async (key) => {
          const res = await client.fetch(url(key), { method: "DELETE" });
          if (!res.ok && res.status !== 404) {
            console.error(`[metis-resend] blob store rejected DELETE ${key}: ${res.status}`);
          }
        }),
      );
    },
  };
}

export const blobs: BlobStore = env.blob ? s3Store(env.blob) : postgresStore();

export async function deleteBlobs(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await blobs.delete(keys);
  } catch (err) {
    console.error("[metis-resend] failed to delete stored blobs", err);
  }
}

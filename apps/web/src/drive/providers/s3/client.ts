import "server-only";
import { Agent as HttpsAgent } from "node:https";

import { S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent } from "undici";

import { getInstanceConfig } from "@/config/runtime";
import type { S3ServerConfig } from "@/config/schema";
import { hashSection } from "@/config/sections";
import { ProviderError } from "@/lib/errors/provider-error";
import { isRecord } from "@/lib/guards";

export interface S3Endpoint {
  endpoint: string;
  forcePathStyle: boolean;
  allowInsecureTls: boolean;
}

const CHECKSUM_MODE = {
  required: "WHEN_REQUIRED",
  supported: "WHEN_SUPPORTED",
} as const;

export function createS3Client(server: S3ServerConfig): S3Client {
  const mode = CHECKSUM_MODE[server.checksums];
  return new S3Client({
    endpoint: server.endpoint,
    region: server.region,
    forcePathStyle: server.forcePathStyle,
    credentials: {
      accessKeyId: server.accessKeyId,
      secretAccessKey: server.secretAccessKey,
    },
    requestChecksumCalculation: mode,
    responseChecksumValidation: mode,
    ...(server.allowInsecureTls
      ? {
          requestHandler: new NodeHttpHandler({
            httpsAgent: new HttpsAgent({ rejectUnauthorized: false }),
          }),
        }
      : {}),
  });
}

const CLIENTS = new Map<string, { version: string; client: S3Client }>();

export function s3Client(serverId: string): S3Client {
  const server = getInstanceConfig().s3Servers.find((entry) => entry.id === serverId);
  if (!server) {
    throw new Error("That S3 server is not configured here");
  }
  const version = hashSection(server);
  const cached = CLIENTS.get(serverId);
  if (cached?.version === version) return cached.client;
  const client = createS3Client(server);
  CLIENTS.set(serverId, { version, client });
  return client;
}

export function s3ErrorStatus(err: unknown): number | undefined {
  if (!isRecord(err) || !isRecord(err.$metadata)) return undefined;
  const status = err.$metadata.httpStatusCode;
  return typeof status === "number" ? status : undefined;
}

export async function s3Send<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof S3ServiceException) {
      throw new ProviderError("s3", s3ErrorStatus(err) ?? 502, `${err.name}: ${err.message}`, "S3");
    }
    throw err;
  }
}

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export function objectUrl(endpoint: S3Endpoint, bucket: string, key: string): URL {
  const url = new URL(endpoint.endpoint);
  const path = key.split("/").map(encodeURIComponent).join("/");
  if (endpoint.forcePathStyle) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/${bucket}/${path}`;
  } else {
    url.hostname = `${bucket}.${url.hostname}`;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path}`;
  }
  return url;
}

export async function corsPreflight(
  endpoint: S3Endpoint,
  url: URL,
  origin: string,
): Promise<Response> {
  return fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
    },
    ...(endpoint.allowInsecureTls ? { dispatcher: insecureAgent } : {}),
  });
}

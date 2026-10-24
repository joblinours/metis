import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

import { formatUrl } from "@aws-sdk/core/util";
import { S3RequestPresigner } from "@aws-sdk/s3-request-presigner";
import { Sha256 } from "@smithy/core/checksum";
import { escapeUri } from "@smithy/core/protocols";

import { config } from "@/config";

export const RELAY_PATH = "/api/drive/relay";

const ALGORITHM = "AWS4-HMAC-SHA256";
const REGION = "auto";
const SERVICE = "s3";
const SIGNED_HEADERS = "host";
const AMZ_PREFIX = "X-Amz-";
const MAX_EXPIRY_SEC = 3600;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const AMZ_DATE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

export interface RelayTarget {
  method: "GET" | "PUT";
  driveId: string;
  key: string;
  query: Record<string, string>;
}

export interface RelayGrant extends RelayTarget {
  userId: string;
}

function relayPath(driveId: string, key: string): string {
  return `${RELAY_PATH}/${escapeUri(driveId)}/${key.split("/").map(escapeUri).join("/")}`;
}

function parseRelayPath(pathname: string): { driveId: string; key: string } | null {
  if (!pathname.startsWith(`${RELAY_PATH}/`)) return null;
  try {
    const [driveId, ...rest] = pathname
      .slice(RELAY_PATH.length + 1)
      .split("/")
      .map(decodeURIComponent);
    const key = rest.join("/");
    return driveId && key ? { driveId, key } : null;
  } catch {
    return null;
  }
}

function parseAmzDate(value: string): Date | null {
  if (!AMZ_DATE.test(value)) return null;
  const time = Date.parse(value.replace(AMZ_DATE, "$1-$2-$3T$4:$5:$6Z"));
  return Number.isNaN(time) ? null : new Date(time);
}

function publicBase(): URL {
  return new URL(config.auth.url);
}

function userSecret(userId: string): string {
  const secret = config.drive.relaySecret;
  if (!secret) throw new Error("METIS_DRIVE_RELAY_SECRET is not configured");
  return createHmac("sha256", secret).update(userId).digest("hex");
}

function presigner(userId: string): S3RequestPresigner {
  return new S3RequestPresigner({
    credentials: { accessKeyId: userId, secretAccessKey: userSecret(userId) },
    region: REGION,
    sha256: Sha256,
  });
}

function relayRequest(target: RelayTarget) {
  const base = publicBase();
  return {
    method: target.method,
    protocol: base.protocol,
    hostname: base.hostname,
    port: base.port ? Number(base.port) : undefined,
    path: relayPath(target.driveId, target.key),
    query: { ...target.query },
    headers: { host: base.host },
  };
}

function sameSignature(expected: string, given: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function presignRelayUrl(
  userId: string,
  target: RelayTarget,
  expiresIn: number,
): Promise<string> {
  return formatUrl(await presigner(userId).presign(relayRequest(target), { expiresIn }));
}

export async function verifyRelayRequest(method: string, url: URL): Promise<RelayGrant | null> {
  if (method !== "GET" && method !== "PUT") return null;

  const params = url.searchParams;
  const signature = params.get("X-Amz-Signature");
  const amzDate = params.get("X-Amz-Date") ?? "";
  const signedAt = parseAmzDate(amzDate);
  const expiresIn = Number(params.get("X-Amz-Expires"));
  const credential = params.get("X-Amz-Credential")?.split("/") ?? [];
  const [userId, shortDate, region, service, terminator] = credential;

  if (
    params.get("X-Amz-Algorithm") !== ALGORITHM ||
    params.get("X-Amz-SignedHeaders") !== SIGNED_HEADERS ||
    !signature ||
    !signedAt ||
    credential.length !== 5 ||
    !userId ||
    shortDate !== amzDate.slice(0, 8) ||
    region !== REGION ||
    service !== SERVICE ||
    terminator !== "aws4_request" ||
    !Number.isInteger(expiresIn) ||
    expiresIn < 1 ||
    expiresIn > MAX_EXPIRY_SEC
  ) {
    return null;
  }

  const now = Date.now();
  if (signedAt.getTime() - CLOCK_SKEW_MS > now || signedAt.getTime() + expiresIn * 1000 < now) {
    return null;
  }

  const location = parseRelayPath(url.pathname);
  if (!location) return null;

  const entries = [...params].filter(([name]) => !name.startsWith(AMZ_PREFIX));
  if (new Set(entries.map(([name]) => name)).size !== entries.length) {
    return null;
  }
  const target: RelayTarget = {
    method,
    ...location,
    query: Object.fromEntries(entries),
  };

  const expected = await presigner(userId).presign(relayRequest(target), {
    signingDate: signedAt,
    expiresIn,
  });
  const computed = expected.query?.["X-Amz-Signature"];
  if (typeof computed !== "string" || !sameSignature(computed, signature)) {
    return null;
  }
  return { ...target, userId };
}

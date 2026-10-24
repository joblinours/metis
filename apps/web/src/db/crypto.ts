import crypto from "node:crypto";

import { customType } from "drizzle-orm/sqlite-core";

const CIPHER_PREFIX = "v1";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = Buffer.from(process.env.METIS_ENCRYPTION_KEY ?? "", "base64");
  if (raw.length !== KEY_BYTES) {
    throw new Error(
      "METIS_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)",
    );
  }

  cachedKey = raw;
  return cachedKey;
}

function seal(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    CIPHER_PREFIX,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    body.toString("base64"),
  ].join(":");
}

function open(stored: string, column = "unknown"): string {
  const [version, ivB64, tagB64, bodyB64] = stored.split(":");
  if (version !== CIPHER_PREFIX || !ivB64 || !tagB64 || !bodyB64) {
    console.error(
      `[db-crypto] ${column} is not sealed with ${CIPHER_PREFIX}: found ${JSON.stringify(version ?? "")} with ${stored.split(":").length} segments`,
    );
    throw new Error("Could not read an encrypted value");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptedText(name: string) {
  return customType<{ data: string; driverData: string }>({
    dataType: () => "text",
    toDriver: seal,
    fromDriver: (stored) => open(stored, name),
  })(name);
}

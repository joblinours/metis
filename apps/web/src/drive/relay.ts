import "server-only";
import { getInstanceConfig } from "@/config/runtime";
import type { DriveDownloadTarget, DriveEntry, DriveUploadSession, NewUpload } from "@/types/drive";

import { presignRelayUrl } from "./relay-signature";

export function relayMaxBytes(): number {
  return getInstanceConfig().relay.relayMaxMb * 1024 * 1024;
}

export const RELAY_BUSY = "Too many transfers are running. Wait for one to finish";

const DOWNLOAD_EXPIRY_SEC = 300;
const UPLOAD_EXPIRY_SEC = 3600;

export interface RelayScope {
  userId: string;
  driveId: string;
}

export class RelayLimitError extends Error {}

export function relayTooLarge(): RelayLimitError {
  return new RelayLimitError(
    `Files over ${getInstanceConfig().relay.relayMaxMb} MB cannot be transferred for this drive`,
  );
}

const activeTransfers = new Map<string, number>();

function relaySlotFree(userId: string): boolean {
  return (activeTransfers.get(userId) ?? 0) < getInstanceConfig().relay.relayConcurrency;
}

export function acquireRelaySlot(userId: string): (() => void) | null {
  const active = activeTransfers.get(userId) ?? 0;
  if (active >= getInstanceConfig().relay.relayConcurrency) return null;
  activeTransfers.set(userId, active + 1);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = (activeTransfers.get(userId) ?? 1) - 1;
    if (current <= 0) activeTransfers.delete(userId);
    else activeTransfers.set(userId, current);
  };
}

export function relayStream(
  source: ReadableStream<Uint8Array>,
  maxBytes: number,
  onSettled: () => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let total = 0;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    onSettled();
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          settle();
          return;
        }
        total += value.byteLength;
        if (total > maxBytes) {
          const err = relayTooLarge();
          await reader.cancel(err).catch(() => {});
          controller.error(err);
          settle();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        controller.error(err);
        settle();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
      settle();
    },
  });
}

export function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function relayUnsupported(): never {
  throw new Error("This drive does not transfer files through the server");
}

function requireScope(scope: RelayScope | undefined): RelayScope {
  if (!scope) throw new Error("Relay URLs need a user and a drive to sign for");
  return scope;
}

export async function relayDownloadTarget(
  scope: RelayScope | undefined,
  entry: DriveEntry,
): Promise<DriveDownloadTarget> {
  const { userId, driveId } = requireScope(scope);
  if (entry.size !== null && entry.size > relayMaxBytes()) {
    return {
      kind: "unavailable",
      reason: relayTooLarge().message,
      webUrl: null,
    };
  }
  if (!relaySlotFree(userId)) {
    return { kind: "unavailable", reason: RELAY_BUSY, webUrl: null };
  }
  return {
    kind: "redirect",
    url: await presignRelayUrl(
      userId,
      { method: "GET", driveId, key: entry.id, query: {} },
      DOWNLOAD_EXPIRY_SEC,
    ),
    expiresAt: new Date(Date.now() + DOWNLOAD_EXPIRY_SEC * 1000),
    name: entry.name,
  };
}

export async function relayUploadSession(
  scope: RelayScope | undefined,
  upload: NewUpload,
): Promise<DriveUploadSession> {
  const { userId, driveId } = requireScope(scope);
  return {
    strategy: "presigned-put",
    url: await presignRelayUrl(
      userId,
      {
        method: "PUT",
        driveId,
        key: upload.name,
        query: upload.parentId ? { parent: upload.parentId } : {},
      },
      UPLOAD_EXPIRY_SEC,
    ),
    headers: {},
    chunkSize: 0,
    authRequired: false,
  };
}

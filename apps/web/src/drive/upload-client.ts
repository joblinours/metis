import { isRecord } from "@/lib/guards";
import type { DriveUploadStrategy } from "@/types/drive";

export interface DriveUploadTarget {
  strategy: DriveUploadStrategy;
  url: string;
  headers: Record<string, string>;
  chunkSize: number;
}

async function put(
  name: string,
  url: string,
  headers: Record<string, string>,
  body: BodyInit | null,
): Promise<Response> {
  try {
    return await fetch(url, { method: "PUT", headers, body });
  } catch {
    throw new Error(`Couldn't upload ${name} to the drive. Check your connection and try again.`);
  }
}

async function putChunk(
  name: string,
  url: string,
  headers: Record<string, string>,
  body: BodyInit | null,
  range: string,
): Promise<Response> {
  return put(name, url, { ...headers, "Content-Range": range }, body);
}

async function uploadFailure(res: Response): Promise<Error> {
  const body: unknown = await res.json().catch(() => null);
  return new Error(
    isRecord(body) && typeof body.error === "string" ? body.error : `Upload failed (${res.status})`,
  );
}

export async function uploadToDrive(
  session: DriveUploadTarget,
  blob: Blob,
  name: string,
  onProgress?: (loaded: number) => void,
): Promise<void> {
  if (session.strategy === "presigned-put") {
    const res = await put(name, session.url, session.headers, blob);
    if (!res.ok) throw await uploadFailure(res);
    onProgress?.(blob.size);
    return;
  }

  if (blob.size === 0) {
    const res = await putChunk(name, session.url, session.headers, null, "bytes */0");
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    onProgress?.(0);
    return;
  }

  let start = 0;
  while (start < blob.size) {
    const end = Math.min(start + session.chunkSize, blob.size);
    // oxlint-disable-next-line eslint/no-await-in-loop -- resumable sessions accept chunks only in byte order
    const res = await putChunk(
      name,
      session.url,
      session.headers,
      blob.slice(start, end),
      `bytes ${start}-${end - 1}/${blob.size}`,
    );

    if (res.ok) {
      onProgress?.(blob.size);
      return;
    }
    if (res.status !== 308 && res.status !== 202) {
      throw new Error(`Upload failed (${res.status})`);
    }

    start = end;
    onProgress?.(start);
  }
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

import { z } from "zod";

const CACHE_DIR = "metis-drive-preview";
const INDEX_FILE = "index.json";
const BUDGET_BYTES = 1024 * 1024 * 1024;

export interface PreviewFreshness {
  modifiedAt: string | null;
  size: number | null;
}

const cacheIndexSchema = z.record(
  z.string(),
  z.object({
    modifiedAt: z.string(),
    size: z.number().nullable(),
    bytes: z.number(),
    openedAt: z.number(),
  }),
);

type CacheIndex = z.infer<typeof cacheIndexSchema>;
type CacheRecord = CacheIndex[string];

export interface PreviewCacheWriter {
  write: (chunk: Uint8Array<ArrayBuffer>) => Promise<void>;
  commit: () => Promise<void>;
  abort: () => Promise<void>;
}

let queue: Promise<unknown> = Promise.resolve();
let clearing = 0;
const openWritables = new Set<FileSystemWritableFileStream>();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

async function cacheDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(CACHE_DIR, { create });
  } catch {
    return null;
  }
}

async function readIndex(dir: FileSystemDirectoryHandle): Promise<CacheIndex> {
  try {
    const file = await (await dir.getFileHandle(INDEX_FILE)).getFile();
    const parsed = cacheIndexSchema.safeParse(JSON.parse(await file.text()));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

async function writeIndex(dir: FileSystemDirectoryHandle, index: CacheIndex): Promise<void> {
  const handle = await dir.getFileHandle(INDEX_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(index));
  await writable.close();
}

async function removeFile(dir: FileSystemDirectoryHandle, key: string): Promise<void> {
  await dir.removeEntry(key).catch(() => {});
}

function isFresh(record: CacheRecord, freshness: PreviewFreshness): boolean {
  return record.modifiedAt === freshness.modifiedAt && record.size === freshness.size;
}

async function evict(
  dir: FileSystemDirectoryHandle,
  index: CacheIndex,
  keep: string,
): Promise<void> {
  let total = Object.values(index).reduce((sum, r) => sum + r.bytes, 0);
  const oldest = Object.entries(index)
    .filter(([key]) => key !== keep)
    .toSorted(([, a], [, b]) => a.openedAt - b.openedAt);
  const evicted: string[] = [];
  for (const [key, record] of oldest) {
    if (total <= BUDGET_BYTES) break;
    evicted.push(key);
    total -= record.bytes;
  }
  await Promise.all(evicted.map((key) => removeFile(dir, key)));
  for (const key of evicted) delete index[key];
}

export async function previewCacheKey(driveId: string, fileId: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${driveId}\n${fileId}`),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  } catch {
    return null;
  }
}

export function readCachedPreview(key: string, freshness: PreviewFreshness): Promise<File | null> {
  if (freshness.modifiedAt === null) return Promise.resolve(null);
  return serial(async () => {
    const dir = await cacheDir(false);
    if (!dir) return null;
    const index = await readIndex(dir);
    const record = index[key];
    if (!record) return null;
    if (!isFresh(record, freshness)) {
      await removeFile(dir, key);
      delete index[key];
      await writeIndex(dir, index);
      return null;
    }
    const file = await (await dir.getFileHandle(key)).getFile();
    if (file.size !== record.bytes) return null;
    record.openedAt = Date.now();
    await writeIndex(dir, index);
    return file;
  }).catch(() => null);
}

export async function openPreviewCacheWriter(
  key: string,
  freshness: PreviewFreshness,
): Promise<PreviewCacheWriter | null> {
  const { modifiedAt, size } = freshness;
  if (modifiedAt === null || clearing > 0) return null;
  const dir = await cacheDir(true);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(key, { create: true });
    const writable = await handle.createWritable();
    if (clearing > 0) {
      await writable.abort().catch(() => {});
      await removeFile(dir, key);
      return null;
    }
    openWritables.add(writable);
    let bytes = 0;
    const discard = async () => {
      openWritables.delete(writable);
      await writable.abort().catch(() => {});
      await serial(async () => {
        const index = await readIndex(dir);
        if (!index[key]) await removeFile(dir, key);
      }).catch(() => {});
    };
    return {
      write: async (chunk) => {
        await writable.write(chunk);
        bytes += chunk.byteLength;
      },
      commit: async () => {
        try {
          await writable.close();
        } finally {
          openWritables.delete(writable);
        }
        await serial(async () => {
          const index = await readIndex(dir);
          index[key] = { modifiedAt, size, bytes, openedAt: Date.now() };
          await evict(dir, index, key);
          await writeIndex(dir, index);
        });
      },
      abort: discard,
    };
  } catch {
    return null;
  }
}

export async function clearPreviewCache(): Promise<void> {
  clearing++;
  try {
    const pending = [...openWritables];
    openWritables.clear();
    await Promise.all(pending.map((w) => w.abort().catch(() => {})));
    await serial(async () => {
      if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return;
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(CACHE_DIR, { recursive: true });
    });
  } catch {
  } finally {
    clearing--;
  }
}

import { readdir } from "node:fs/promises";

import { FILE_BULK_COUNT, FILE_BULK_PREFIX, FILE_CASES } from "./edge/file-cases";
import { PREVIEW_CASES } from "./preview/file-cases";
import { edgeEnabled, reject } from "./report";

const FIXTURES = new URL("./fixtures/files/", import.meta.url);

export interface FileSink {
  area: string;
  label: string;
  put(key: string, body: Uint8Array, contentType?: string): Promise<void>;
  close?(): Promise<void>;
}

async function inBatches(
  count: number,
  size: number,
  run: (i: number) => Promise<void>,
): Promise<void> {
  for (let start = 0; start < count; start += size) {
    await Promise.all(
      Array.from({ length: Math.min(size, count - start) }, (_, j) => run(start + j)),
    );
  }
}

export async function seedFiles(sink: FileSink, edge?: { bulkConcurrency: number }): Promise<void> {
  try {
    const files = await readdir(FIXTURES, { recursive: true });
    let count = 0;
    for (const file of files.toSorted()) {
      const blob = Bun.file(new URL(file, FIXTURES));
      if (!(await blob.exists()) || blob.size === 0) continue;
      await sink.put(file, new Uint8Array(await blob.arrayBuffer()), blob.type);
      count++;
    }
    console.log(`[seed] uploaded ${count} files to ${sink.label}`);

    let previewed = 0;
    for (const preview of PREVIEW_CASES) {
      try {
        await sink.put(preview.key, preview.body(), preview.contentType);
        previewed++;
      } catch (err) {
        reject(sink.area, preview.key, err);
      }
    }
    console.log(
      `[seed] uploaded ${previewed}/${PREVIEW_CASES.length} preview files to ${sink.label}`,
    );

    if (!edge || !edgeEnabled()) return;

    let accepted = 0;
    for (const fileCase of FILE_CASES) {
      try {
        await sink.put(fileCase.key, fileCase.body(), fileCase.contentType);
        accepted++;
      } catch (err) {
        reject(sink.area, fileCase.key.slice(0, 80), err);
      }
    }
    console.log(
      `[seed] uploaded ${accepted}/${FILE_CASES.length} edge-case files to ${sink.label}`,
    );

    await inBatches(FILE_BULK_COUNT, edge.bulkConcurrency, async (i) => {
      await sink.put(
        `${FILE_BULK_PREFIX}file-${String(i).padStart(5, "0")}.txt`,
        new TextEncoder().encode(`bulk object ${i}`),
        "text/plain",
      );
    });
    console.log(
      `[seed] uploaded ${FILE_BULK_COUNT} files under ${FILE_BULK_PREFIX} to ${sink.label}`,
    );
  } finally {
    await sink.close?.();
  }
}

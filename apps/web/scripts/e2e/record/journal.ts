import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

import { llmResponseSchema } from "@metis/e2e/lib/llm-key";
import { z } from "zod";

import { isMissing } from "./merge";

const journalEntrySchema = z.object({
  runId: z.string(),
  scenario: z.string(),
  key: z.string(),
  path: z.string(),
  request: z.unknown(),
  response: llmResponseSchema,
  at: z.string(),
});
export type JournalEntry = z.infer<typeof journalEntrySchema>;

export class Journal {
  readonly path: string;
  private fd: number;

  constructor(url: URL) {
    this.path = url.pathname;
    mkdirSync(dirname(this.path), { recursive: true });
    this.fd = openSync(this.path, "a");
  }

  read(): JournalEntry[] {
    let raw: string;
    try {
      raw = readFileSync(this.path, "utf8");
    } catch (err) {
      if (isMissing(err)) return [];
      throw err;
    }
    const entries: JournalEntry[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(journalEntrySchema.parse(JSON.parse(line)));
      } catch {
        console.log(`[record] skipped a torn line in ${this.path}`);
      }
    }
    return entries;
  }

  append(entry: JournalEntry): void {
    writeSync(this.fd, `${JSON.stringify(entry)}\n`);
    fsyncSync(this.fd);
  }

  replace(entries: JournalEntry[]): void {
    closeSync(this.fd);
    const next = `${this.path}.next`;
    writeFileSync(next, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""));
    renameSync(next, this.path);
    this.fd = openSync(this.path, "a");
  }

  close(): void {
    closeSync(this.fd);
  }
}

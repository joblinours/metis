import { ingestReceived } from "./ingest";
import { listReceived } from "./resend";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export async function pollReceived(): Promise<{
  stored: number;
  scanned: number;
}> {
  let stored = 0;
  let scanned = 0;
  let after: string | undefined;

  /* oxlint-disable eslint/no-await-in-loop -- pages follow the previous page's last id, and the poll stops at the first page of duplicates */
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await listReceived({ limit: PAGE_SIZE, after });
    const rows = batch.data ?? [];
    if (rows.length === 0) break;

    let consecutiveDuplicates = 0;
    for (const row of rows) {
      scanned += 1;
      const outcome = await ingestReceived(row.id);
      if (outcome === "stored") {
        stored += 1;
        consecutiveDuplicates = 0;
      } else {
        consecutiveDuplicates += 1;
      }
    }

    if (consecutiveDuplicates === rows.length) break;
    if (!batch.has_more) break;
    after = rows.at(-1)?.id;
    if (!after) break;
  }
  /* oxlint-enable eslint/no-await-in-loop */

  return { stored, scanned };
}

export function startPolling(intervalSec: number): void {
  if (intervalSec <= 0) return;
  let running = false;

  setInterval(() => {
    if (running) return;
    running = true;
    pollReceived()
      .then(({ stored, scanned }) => {
        if (stored > 0) {
          console.log(`[metis-resend] poll stored ${stored} of ${scanned} scanned`);
        }
      })
      .catch((err) => {
        console.error("[metis-resend] poll failed", err);
      })
      .finally(() => {
        running = false;
      });
  }, intervalSec * 1000);

  console.log(`[metis-resend] polling inbound every ${intervalSec}s`);
}

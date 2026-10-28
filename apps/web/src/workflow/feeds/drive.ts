import "server-only";
import { adapterForDrive } from "@/drive/aggregate";
import { findFolderPath, listFileValues } from "@/ops/values";

import { authorizeDrive } from "../authorization";
import {
  type FeedContext,
  type FeedEvent,
  type FeedPoll,
  freshCursor,
  literalParam,
  withAbort,
} from "./shared";

const SNAPSHOT_LIMIT = 2_000;
const RESCAN_EVERY = 10;

export async function pollDrive(ctx: FeedContext): Promise<FeedPoll> {
  const driveId = literalParam(ctx.node, "drive");
  const folder = literalParam(ctx.node, "folder");
  const scope = `drive:${driveId}:${folder}`;
  const cursor = ctx.cursors.get(scope) ?? freshCursor(scope, ctx.now);
  const authorized = await authorizeDrive({ principal: ctx.principal, driveId });
  if (!authorized.ok) return { events: [], baseline: false, cursor, error: authorized.reason };
  const drive = authorized.value;

  const folderId =
    cursor.resource !== undefined ? cursor.resource : await findFolderPath(drive, folder);
  const adapter = await adapterForDrive(drive);
  let signal = adapter.changes
    ? await withAbort(
        adapter.changes(folderId, cursor.baselined ? (cursor.token ?? null) : null),
        ctx.signal,
      )
    : null;
  if (signal?.expired && adapter.changes) {
    signal = await withAbort(adapter.changes(folderId, null), ctx.signal);
  }
  if (
    signal &&
    !signal.expired &&
    !signal.changed &&
    cursor.baselined &&
    cursor.token &&
    cursor.scans % RESCAN_EVERY !== 0
  ) {
    return {
      events: [],
      baseline: false,
      cursor: {
        ...cursor,
        token: signal.cursor,
        scans: cursor.scans + 1,
        updatedAt: ctx.now.toISOString(),
      },
    };
  }
  const files = await listFileValues(drive, folderId, SNAPSHOT_LIMIT);
  const previous = cursor.snapshot ?? {};
  const current: Record<string, string> = {};
  const events: FeedEvent[] = [];
  const baselining = !cursor.baselined;
  const changedKind = ctx.trigger.kind === "trigger.drive.changed";

  for (const file of files) {
    if (file.kind === "folder") continue;
    const stamp = `${file.modifiedAt ?? ""}|${file.size}`;
    current[file.id] = stamp;
    if (baselining) continue;
    const before = previous[file.id];
    if (!changedKind && before === undefined) {
      events.push({ key: `added:${file.id}`, at: ctx.now, value: file });
    }
    if (changedKind && before !== undefined && before !== stamp) {
      events.push({ key: `changed:${file.id}:${stamp}`, at: ctx.now, value: file });
    }
  }

  return {
    events,
    baseline: false,
    cursor: {
      scope,
      snapshot: current,
      token: signal && !signal.expired ? signal.cursor : undefined,
      resource: cursor.scans % RESCAN_EVERY === 0 ? undefined : folderId,
      scans: cursor.scans + 1,
      baselined: true,
      updatedAt: ctx.now.toISOString(),
    },
  };
}

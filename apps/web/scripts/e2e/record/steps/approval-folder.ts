import { APPROVAL_CHAT } from "@metis/e2e/lib/llm-scenarios";

import { getDriveSession } from "../../../../src/drive/session";
import type { RecordSession } from "../session";

export async function removeApprovalFolder(session: RecordSession): Promise<number> {
  const { headers, enrollment } = session;
  const driveSlug = enrollment.driveSlugs[APPROVAL_CHAT.drive];
  if (!driveSlug) throw new Error(`no ${APPROVAL_CHAT.drive} drive enrolled`);
  const drive = await getDriveSession(headers, enrollment.workspaceSlug, driveSlug);
  if (!drive) throw new Error(`drive ${APPROVAL_CHAT.drive} not reachable`);
  const { entries } = await drive.surface.listFolder(APPROVAL_CHAT.parentFolder);
  let removed = 0;
  for (const entry of entries) {
    if (entry.name === APPROVAL_CHAT.folder) {
      await drive.surface.delete(entry.id);
      removed++;
    }
  }
  return removed;
}

import type { Account } from "../clients/harness";

export { type Account, APP, HARNESS, harness, type LlmHit, type LlmMiss } from "../clients/harness";

export const ANA_STATE = "tests/.auth/ana.json";
export const SIGNED_OUT = { cookies: [], origins: [] };

export function workspacePath(a: Account, rest = ""): string {
  return `/w/${a.workspaceSlug}${rest}`;
}

export function mailPath(a: Account, folder = "inbox"): string {
  return workspacePath(a, `/m/${a.mailboxSlug}/${folder}`);
}

export function calendarPath(a: Account): string {
  return workspacePath(a, `/c/${a.calendarSlug}`);
}

export function drivePath(a: Account, kind: string): string {
  const slug = kind === "all" ? "all" : a.driveSlugs[kind];
  if (!slug) throw new Error(`no seeded drive "${kind}"`);
  return workspacePath(a, `/d/${slug}`);
}

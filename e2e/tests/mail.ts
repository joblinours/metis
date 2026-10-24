import { expect, type Locator, type Page } from "@playwright/test";

import type { Rpc } from "./fixtures";
import type { Account } from "./harness";

export const BUILT_IN_LABELS = [
  "Action Required",
  "Work",
  "Personal",
  "Transactions",
  "Updates",
  "Newsletter",
  "Promotional",
  "Social",
] as const;

export function mailList(page: Page): Locator {
  return page.getByRole("main").locator('[aria-roledescription="draggable"]');
}

export function mailRow(page: Page, subject: string): Locator {
  return mailList(page).filter({
    has: page.getByText(subject, { exact: true }),
  });
}

export function rowLabel(row: Locator, label: string): Locator {
  return row.getByText(label === "Promotional" ? "Promo" : label, {
    exact: true,
  });
}

export function anyRowLabel(row: Locator): Locator {
  return row.getByText(
    /^(Action Required|Work|Personal|Transactions|Updates|Newsletter|Promo|Social)$/,
  );
}

export function folders(page: Page): Locator {
  return page.getByRole("complementary", { name: "Folders" });
}

export function messageToolbar(page: Page): Locator {
  return page.locator('div:has(> button[title="Previous message"])');
}

export function messageHeading(page: Page): Locator {
  return page.getByRole("main").getByRole("heading", { level: 2 });
}

export function bulkToolbar(page: Page): Locator {
  return page.getByRole("main").locator('div:has(> button[title="Clear selection"])');
}

export async function openMail(page: Page, subject: string): Promise<void> {
  await mailRow(page, subject).click();
  await expect(messageHeading(page)).toHaveText(subject);
  await expect(messageToolbar(page)).toBeVisible();
}

export async function showTab(page: Page, tab: string): Promise<void> {
  await page.getByRole("tab", { name: tab, exact: true }).click();
}

export function composer(page: Page): Locator {
  return page.locator('[aria-modal="true"]').filter({
    has: page.getByRole("button", { name: "Close compose" }),
  });
}

export function composerBody(page: Page): Locator {
  return composer(page).locator('[contenteditable="true"]');
}

export function confirmDialog(page: Page, title: string | RegExp): Locator {
  return page.getByRole("alertdialog", { name: title });
}

export function scheduledRow(page: Page, subject: string): Locator {
  return page
    .getByRole("main")
    .locator("div:has(> button)")
    .filter({ has: page.getByText(subject, { exact: true }) });
}

export function snoozedRow(page: Page, subject: string): Locator {
  return page
    .getByRole("main")
    .locator("div:has(> div > button)")
    .filter({ has: page.getByText(subject, { exact: true }) });
}

export function mailAgent(page: Page): Locator {
  return page.getByRole("group").filter({
    has: page.getByRole("textbox", { name: "Ask about your emails…" }),
  });
}

export async function snoozeArmed(rpc: Rpc, account: Account, subject: string): Promise<void> {
  await expect
    .poll(async () => {
      const { emails } = await rpc<{
        emails: { subject: string; status: string }[];
      }>("mail.messages.listSnoozed", {
        workspaceSlug: account.workspaceSlug,
        mailboxSlug: account.mailboxSlug,
      });
      return emails.find((e) => e.subject === subject)?.status;
    })
    .toBe("pending");
}

export async function pickDrive(
  dialog: Locator,
  rpc: Rpc,
  account: Account,
  driveSlug: string,
): Promise<void> {
  const { drives } = await rpc<{
    drives: { slug: string; server: string | null; email: string }[];
  }>("workspaceDrives.list", { workspaceSlug: account.workspaceSlug });
  const drive = drives.find((d) => d.slug === driveSlug);
  expect(drive?.server, `drive ${driveSlug} has a server name`).toBeTruthy();
  await dialog
    .getByRole("button", {
      name: `${drive?.server} · ${drive?.email}`,
      exact: true,
    })
    .click();
}

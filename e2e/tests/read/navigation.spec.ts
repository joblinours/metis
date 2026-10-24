import { expect, test } from "../fixtures";
import { mailPath, workspacePath } from "../harness";
import { mailList, mailRow, messageToolbar, openMail, showTab } from "../mail";

test("an unknown workspace or mailbox redirects to one the user can reach, and an unknown page is a 404", async ({
  page,
  account,
}) => {
  await page.goto("/w/no-such-workspace/m");
  await expect(page).toHaveURL(new RegExp(`/w/${account.workspaceSlug}/`));
  await page.goto(workspacePath(account, "/m/no-such-mailbox/inbox"));
  await expect(page).toHaveURL(new RegExp(`${mailPath(account)}$`));
  expect((await page.goto("/dashboard/no-such-page"))?.status()).toBe(404);
});

test("? opens the keyboard shortcut help on mail, calendar and drive", async ({
  page,
  account,
}) => {
  for (const path of [
    mailPath(account),
    workspacePath(account, "/c"),
    workspacePath(account, "/d"),
  ]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "App navigation" })).toBeVisible();
    const help = page.getByRole("heading", {
      level: 2,
      name: "Keyboard shortcuts",
    });
    await expect(async () => {
      await page.evaluate("document.activeElement && document.activeElement.blur()");
      await page.keyboard.press("?");
      await expect(help, path).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await page
      .locator("div:has(> h2)")
      .filter({ has: help })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(help).toBeHidden();
  }
});

test.describe("on a phone-sized screen", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the inbox and a message each take the whole screen", async ({ page, account }) => {
    await page.goto(mailPath(account));
    await showTab(page, "All");
    await openMail(page, "Rebrand kickoff");
    await expect(mailList(page)).toHaveCount(0);
    await messageToolbar(page).getByRole("button", { name: "Back" }).click();
    await expect(mailRow(page, "Rebrand kickoff")).toBeVisible();
    await expect(messageToolbar(page)).toHaveCount(0);
  });
});

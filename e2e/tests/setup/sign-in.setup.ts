import { INBOX_PAGE_SIZE } from "@metis/e2e/lib/llm-scenarios";

import { signIn } from "../auth";
import { expect, rpcFor, test as setup } from "../fixtures";
import { ANA_STATE, harness, mailPath } from "../harness";
import { mailRow, showTab } from "../mail";

setup("sign in as Ana and open the first inbox page", async ({ page, account }) => {
  setup.setTimeout(15 * 60_000);
  await signIn(page, account, () => harness.totp());
  await page.context().storageState({ path: ANA_STATE });

  const rpc = rpcFor(page.request);
  const scope = {
    workspaceSlug: account.workspaceSlug,
    mailboxSlug: account.mailboxSlug,
  };
  const { emails } = await rpc<{ emails: { id: string; isRead: boolean }[] }>(
    "mail.messages.list",
    { ...scope, folder: "inbox", limit: INBOX_PAGE_SIZE },
  );
  const unread = emails.filter((e) => !e.isRead).map((e) => e.id);
  if (unread.length > 0)
    await rpc("mail.messages.markRead", {
      ...scope,
      ids: unread,
      read: true,
    });

  const firstPage = page.waitForResponse(/\/rpc\/mail\/messages\/list/);
  await page.goto(mailPath(account));
  await firstPage;
  await showTab(page, "All");
  await expect(mailRow(page, "Rebrand kickoff")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.context().storageState({ path: ANA_STATE });
});

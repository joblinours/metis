import { harness } from "../clients/harness";
import { assertNoLlmMisses } from "../clients/llm-misses";
import { rpcWithCookie } from "../clients/rpc";
import { INBOX_PAGE_SIZE } from "../lib/llm-scenarios";
import { mailboxScope, saveSession, signIn } from "./support/session";

export async function setup() {
  const account = await harness.account();
  const cookie = await signIn(account.email, account.password, () => harness.totp());
  await saveSession(cookie);

  const rpc = rpcWithCookie(cookie);
  const { emails } = await rpc<{ emails: { id: string; isRead: boolean }[] }>(
    "mail.messages.list",
    { ...mailboxScope(account), folder: "inbox", limit: INBOX_PAGE_SIZE },
  );
  const unread = emails.filter((e) => !e.isRead).map((e) => e.id);
  if (unread.length > 0) {
    await rpc("mail.messages.markRead", {
      ...mailboxScope(account),
      ids: unread,
      read: true,
    });
  }
}

export async function teardown() {
  await assertNoLlmMisses();
}

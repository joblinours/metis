import type { Page } from "@playwright/test";

import { expect, type Rpc, test } from "../fixtures";
import { type Account, mailPath } from "../harness";
import { mailRow, showTab } from "../mail";

const PAGE_SIZE = 100;
const PLAIN_SUBJECT = /^[A-Za-z0-9][\w .,:'-]{3,60}$/;

interface ListedEmail {
  id: string;
  threadId?: string;
  subject: string;
  isRead: boolean;
}

interface ListPage {
  emails: ListedEmail[];
  nextPageToken?: string;
}

function scope(account: Account) {
  return {
    workspaceSlug: account.workspaceSlug,
    mailboxSlug: account.mailboxSlug,
  };
}

async function beyondFirstPage(
  rpc: Rpc,
  account: Account,
  wanted: (email: ListedEmail) => boolean,
): Promise<ListedEmail> {
  const pages: ListedEmail[][] = [];
  let pageToken: string | undefined;
  do {
    const page = await rpc<ListPage>("mail.messages.list", {
      ...scope(account),
      folder: "inbox",
      limit: PAGE_SIZE,
      pageToken,
    });
    pages.push(page.emails);
    pageToken = page.nextPageToken;
  } while (pageToken);
  expect(pages.length, "the inbox has more than one page").toBeGreaterThan(1);
  const loaded = pages.flat();
  const once = (key: (email: ListedEmail) => string | undefined, value: string | undefined) =>
    loaded.filter((email) => key(email) === value).length === 1;
  const picked = pages
    .slice(1)
    .flat()
    .find(
      (email) =>
        wanted(email) &&
        PLAIN_SUBJECT.test(email.subject) &&
        once((e) => e.subject, email.subject) &&
        (!email.threadId || once((e) => e.threadId, email.threadId)),
    );
  if (!picked) throw new Error("no message beyond the first inbox page fits this test");
  return picked;
}

function watchPaging(page: Page): () => string[] {
  const paged: string[] = [];
  page.on("request", (request) => {
    const body = request.postData() ?? "";
    if (request.url().endsWith("/rpc/mail/messages/list") && body.includes('"pageToken":"')) {
      paged.push(body);
    }
  });
  return () => paged;
}

async function expectListedWithoutPaging(page: Page, subject: string, paged: () => string[]) {
  await expect
    .soft(mailRow(page, subject).first(), "the matching message beyond page one is listed")
    .toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(paged(), "inbox pages the filter fetched on its own").toEqual([]);
}

export default function mailFilterSpecs() {
  test("Unread lists unread mail beyond the first page without paging the inbox", async ({
    page,
    rpc,
    account,
  }) => {
    const deep = await beyondFirstPage(rpc, account, (email) => !email.isRead);
    const paged = watchPaging(page);
    await page.goto(mailPath(account));
    await showTab(page, "Unread");
    await expectListedWithoutPaging(page, deep.subject, paged);
  });

  test("Starred lists starred mail beyond the first page without paging the inbox", async ({
    page,
    rpc,
    account,
  }) => {
    const deep = await beyondFirstPage(rpc, account, () => true);
    const star = (starred: boolean) =>
      rpc("mail.messages.star", { ...scope(account), id: deep.id, starred });
    await star(true);
    try {
      const paged = watchPaging(page);
      await page.goto(mailPath(account));
      await showTab(page, "Starred");
      await expectListedWithoutPaging(page, deep.subject, paged);
    } finally {
      await star(false);
    }
  });

  test("a label filter lists labelled mail beyond the first page without paging the inbox", async ({
    page,
    rpc,
    account,
  }) => {
    const deep = await beyondFirstPage(rpc, account, () => true);
    await rpc("mail.labels.setOnMessage", {
      ...scope(account),
      id: deep.id,
      label: "transactions",
    });
    try {
      const paged = watchPaging(page);
      await page.goto(`${mailPath(account)}?label=transactions`);
      await expectListedWithoutPaging(page, deep.subject, paged);
    } finally {
      await rpc("mail.labels.clearOnMessage", { ...scope(account), id: deep.id });
    }
  });
}

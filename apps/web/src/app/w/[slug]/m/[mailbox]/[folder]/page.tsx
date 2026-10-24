import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isMailFolder, type MailFolder } from "@/types/mail";

import { FolderView } from "./_components/folder-view";

const FOLDER_TITLES: Record<MailFolder, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  starred: "Starred",
  trash: "Trash",
  archive: "Archive",
  spam: "Spam",
};

const READ_LATER = "read-later";

export async function generateMetadata({
  params,
}: PageProps<"/w/[slug]/m/[mailbox]/[folder]">): Promise<Metadata> {
  const { folder } = await params;
  if (folder === READ_LATER) return { title: "Read later" };
  return isMailFolder(folder) ? { title: FOLDER_TITLES[folder] } : {};
}

export default async function FolderPage({ params }: PageProps<"/w/[slug]/m/[mailbox]/[folder]">) {
  const { folder } = await params;

  if (folder === READ_LATER) {
    return <FolderView folder="inbox" view="read-later" />;
  }

  if (!isMailFolder(folder)) {
    notFound();
  }

  return <FolderView folder={folder} />;
}

import { redirect } from "next/navigation";

import { mailPath } from "@/workspace/path";

export default async function MailPage({ params }: PageProps<"/w/[slug]/m/[mailbox]">) {
  const { slug, mailbox } = await params;
  redirect(mailPath(slug, mailbox, "inbox"));
}

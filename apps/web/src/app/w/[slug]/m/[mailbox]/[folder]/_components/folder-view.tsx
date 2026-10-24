"use client";

import { useEffect } from "react";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import { listenPendingOpen, takePendingOpen } from "@/mail/pending-open";
import { type MailListView, useMailStore } from "@/store/mail-store";
import type { Email, MailFolder } from "@/types/mail";

import { EmailDetail } from "./email-detail";
import { EmailList } from "./email-list";
import { ResizablePanels } from "./resizable-panels";

interface FolderViewProps {
  folder: MailFolder;
  view?: MailListView;
}

export function FolderView({ folder, view = "folder" }: FolderViewProps) {
  const scope = useMailboxScope();
  const { selectedEmail, setSelectedFolder, setSelectedEmail } = useMailStore();
  const isMobile = useIsMobile();

  useEffect(() => {
    const open = (pending: Email) => {
      setSelectedEmail({ ...pending, isRead: true });
      if (!pending.isRead) {
        orpc.mail.messages.markRead({ ...scope, ids: [pending.id], read: true }).catch(() => {});
      }
    };
    setSelectedFolder(folder, view);
    const pending = takePendingOpen();
    if (pending && pending.folder === folder) open(pending);
    return listenPendingOpen((email) => {
      if (email.folder !== folder) return false;
      if (email.mailboxSlug && email.mailboxSlug !== scope.mailboxSlug) {
        return false;
      }
      open(email);
      return true;
    });
  }, [folder, view, setSelectedFolder, setSelectedEmail, scope]);

  if (!selectedEmail) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden">
        <EmailList folder={folder} view={view} />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <EmailDetail />
      </div>
    );
  }

  return (
    <ResizablePanels defaultLeftWidth={340} minLeftWidth={280} maxLeftWidth={520}>
      <EmailList folder={folder} view={view} />
      <EmailDetail />
    </ResizablePanels>
  );
}

import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import { WorkspaceMailboxesInner } from "./_components/workspace-mailboxes-inner";

export default function WorkspaceMailboxesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin opacity-50" />
        </div>
      }
    >
      <WorkspaceMailboxesInner />
    </Suspense>
  );
}

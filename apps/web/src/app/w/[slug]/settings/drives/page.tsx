import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import { WorkspaceDrivesInner } from "./_components/workspace-drives-inner";

export default function WorkspaceDrivesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin opacity-50" />
        </div>
      }
    >
      <WorkspaceDrivesInner />
    </Suspense>
  );
}

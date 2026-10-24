"use client";

import { Button } from "@metis/ui/components/button";
import { Sheet, SheetContent, SheetTitle } from "@metis/ui/components/sheet";
import { cn } from "@metis/ui/lib/utils";
import { PanelLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  use,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useIsMobile } from "@/hooks/use-is-mobile";

interface MobileAsideState {
  registered: number;
  setRegistered: Dispatch<SetStateAction<number>>;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MobileAsideContext = createContext<MobileAsideState | null>(null);

export function MobileAsideProvider({ children }: { children: ReactNode }) {
  const [registered, setRegistered] = useState(0);
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ registered, setRegistered, open, setOpen }), [registered, open]);

  return <MobileAsideContext value={value}>{children}</MobileAsideContext>;
}

export function ResponsiveAside({
  label,
  closeKey,
  children,
}: {
  label: string;
  closeKey?: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const ctx = use(MobileAsideContext);
  const setRegistered = ctx?.setRegistered;
  const setOpen = ctx?.setOpen;
  const pathname = usePathname();
  const resetKey = `${pathname}|${closeKey ?? ""}`;

  useEffect(() => {
    if (!isMobile || !setRegistered) return;
    setRegistered((count) => count + 1);
    return () => setRegistered((count) => count - 1);
  }, [isMobile, setRegistered]);

  useEffect(() => {
    if (resetKey) setOpen?.(false);
  }, [resetKey, setOpen]);

  if (!isMobile || !ctx) return children;

  return (
    <Sheet open={ctx.open} onOpenChange={ctx.setOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="max-w-[85vw] gap-0 p-0 data-[side=left]:w-72"
      >
        <SheetTitle className="sr-only">{label}</SheetTitle>
        <div className="flex min-h-0 flex-1 [&>*]:w-full">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function MobileAsideTrigger({ className }: { className?: string }) {
  const ctx = use(MobileAsideContext);
  if (!ctx || ctx.registered === 0) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Open sidebar"
      className={cn("size-10 text-faint", className)}
      onClick={() => ctx.setOpen(true)}
    >
      <PanelLeft className="size-4.5" strokeWidth={1.8} />
    </Button>
  );
}

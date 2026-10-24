"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { route } from "@/lib/route";

interface DriveNavigationValue {
  canBack: boolean;
  canForward: boolean;
  back: () => void;
  forward: () => void;
}

const DriveNavigationContext = createContext<DriveNavigationValue | null>(null);

export function DriveNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const stack = useRef<string[]>([]);
  const cursor = useRef(-1);
  const pending = useRef<number | null>(null);
  const [range, setRange] = useState({ canBack: false, canForward: false });

  useEffect(() => {
    const target = pending.current;
    pending.current = null;
    if (target !== null && stack.current[target] === pathname) {
      cursor.current = target;
    } else if (stack.current[cursor.current] !== pathname) {
      stack.current = [...stack.current.slice(0, cursor.current + 1), pathname];
      cursor.current = stack.current.length - 1;
    }
    setRange({
      canBack: cursor.current > 0,
      canForward: cursor.current < stack.current.length - 1,
    });
  }, [pathname]);

  const go = useCallback(
    (delta: number) => {
      if (pending.current !== null) return;
      const next = cursor.current + delta;
      const target = stack.current[next];
      if (target === undefined) return;
      if (target === pathname) {
        cursor.current = next;
        setRange({
          canBack: next > 0,
          canForward: next < stack.current.length - 1,
        });
        return;
      }
      pending.current = next;
      router.push(route(target));
    },
    [router, pathname],
  );

  const value = useMemo<DriveNavigationValue>(
    () => ({ ...range, back: () => go(-1), forward: () => go(1) }),
    [range, go],
  );

  return (
    <DriveNavigationContext.Provider value={value}>{children}</DriveNavigationContext.Provider>
  );
}

export function useDriveNavigation(): DriveNavigationValue {
  const value = useContext(DriveNavigationContext);
  if (!value) {
    throw new Error("useDriveNavigation needs DriveNavigationProvider");
  }
  return value;
}

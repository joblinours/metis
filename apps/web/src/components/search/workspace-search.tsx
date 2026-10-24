"use client";

import { useEffect } from "react";

import { isTypingTarget } from "@/hooks/use-chord";
import { useSearchStore } from "@/store/search-store";

import { SearchDialog } from "./search-dialog";

export function WorkspaceSearch() {
  const openSearch = useSearchStore((s) => s.openSearch);
  const open = useSearchStore((s) => s.open);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || e.altKey || e.shiftKey) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (!open && isTypingTarget(e.target)) return;
      e.preventDefault();
      if (!open) openSearch();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, openSearch]);

  return <SearchDialog />;
}

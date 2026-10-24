"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "@/auth/client";
import { workspacesQuery } from "@/hooks/use-workspaces";
import { DEFAULT_THEME_BRAND, type ThemeBrandId } from "@/theme/brand";
import { parseWorkspacePath } from "@/workspace/path";

function applyBrand(brand: ThemeBrandId) {
  document.documentElement.setAttribute("data-brand", brand);
}

export function BrandSync() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const workspaceSlug = parseWorkspacePath(pathname).workspaceSlug;
  const userId = session?.user?.twoFactorEnabled ? session.user.id : null;

  const query = useQuery({ ...workspacesQuery, enabled: Boolean(userId) });
  const workspaces = userId ? query.data?.workspaces : undefined;

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      applyBrand(DEFAULT_THEME_BRAND);
      return;
    }
    if (!workspaces) return;
    const current = workspaces.find((w) => w.slug === workspaceSlug) ?? workspaces[0];
    applyBrand(current?.themeBrand ?? DEFAULT_THEME_BRAND);
  }, [userId, isPending, workspaceSlug, workspaces]);

  return null;
}

"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@metis/ui/components/breadcrumb";
import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import { Bot, FolderPlus, LayoutGrid, List, Search, Upload } from "lucide-react";

import type { DriveView } from "./drive-entries";

export interface Crumb {
  id: string | null;
  name: string;
}

export function DriveToolbar({
  crumbs,
  query,
  view,
  onNavigate,
  onQueryChange,
  onViewChange,
  onNewFolder,
  onUpload,
  showAgentToggle,
  agentOpen,
  onToggleAgent,
}: {
  crumbs: Crumb[];
  query: string;
  view: DriveView;
  onNavigate: (index: number) => void;
  onQueryChange: (value: string) => void;
  onViewChange: (view: DriveView) => void;
  onNewFolder: () => void;
  onUpload: () => void;
  showAgentToggle: boolean;
  agentOpen: boolean;
  onToggleAgent: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <Breadcrumb className="min-w-40 flex-1 overflow-hidden">
        <BreadcrumbList>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <BreadcrumbItem key={crumb.id ?? "root"}>
                {last ? (
                  <BreadcrumbPage className="truncate">{crumb.name}</BreadcrumbPage>
                ) : (
                  <>
                    <BreadcrumbLink
                      render={
                        <button
                          type="button"
                          onClick={() => onNavigate(index)}
                          className="truncate"
                        >
                          {crumb.name}
                        </button>
                      }
                    />
                    <BreadcrumbSeparator />
                  </>
                )}
              </BreadcrumbItem>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
        <Input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search this drive"
          className="h-8 w-56 pl-7 text-[12px]"
        />
      </div>

      <Button
        variant="outline"
        size="icon-sm"
        aria-label={view === "list" ? "Switch to grid" : "Switch to list"}
        onClick={() => onViewChange(view === "list" ? "grid" : "list")}
      >
        {view === "list" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
      </Button>

      <Button variant="outline" size="sm" onClick={onNewFolder}>
        <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
        New folder
      </Button>

      <Button size="sm" onClick={onUpload}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Upload
      </Button>

      {showAgentToggle && (
        <Button
          variant={agentOpen ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label="Drive AI"
          onClick={onToggleAgent}
        >
          <Bot className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

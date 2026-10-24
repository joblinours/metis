"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metis/ui/components/tooltip";
import { cn } from "@metis/ui/lib/utils";
import { Loader2, Plus } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useWorkspacePath } from "@/hooks/use-workspace-path";
import {
  invalidateWorkspaces,
  switchWorkspaceHref,
  useWorkspaceHotkeys,
  useWorkspaces,
  type WorkspaceItem,
} from "@/hooks/use-workspaces";
import { getInitials } from "@/lib/utils";
import { onboardingPath } from "@/workspace/path";

import { CreateWorkspaceDialog } from "./create-workspace-dialog";

const HOTKEY_MAX = 9;
const FADE_PX = 16;
const SCROLL_MASK = `linear-gradient(to bottom, #000 calc(100% - ${FADE_PX}px), transparent 100%)`;

function tileClass(active: boolean) {
  return cn(
    "group flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-[10px] text-[13px] font-medium tracking-wide transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "bg-surface text-muted-foreground hover:bg-hover hover:text-foreground",
  );
}

function TileFace({ workspace, active }: { workspace: WorkspaceItem; active: boolean }) {
  if (workspace.logo) {
    return (
      // oxlint-disable-next-line nextjs/no-img-element --tiny data-URL logo, next/image adds nothing
      <img
        src={workspace.logo}
        alt=""
        className={cn(
          "h-full w-full object-cover transition-[filter,opacity]",
          !active && "opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0",
        )}
      />
    );
  }
  return <>{getInitials(workspace.name).slice(0, 2)}</>;
}

function SortableTile({
  workspace,
  active,
  badge,
  href,
}: {
  workspace: WorkspaceItem;
  active: boolean;
  badge: number | null;
  href: Route;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id,
  });
  const draggedRef = useRef(false);

  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      data-active={active || undefined}
      onClickCapture={(e) => {
        if (!draggedRef.current) return;
        draggedRef.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: "none",
      }}
      className={cn("relative flex w-full shrink-0 justify-center", isDragging && "opacity-40")}
    >
      {active && (
        <span className="absolute top-1/2 left-0 h-5 w-0.75 -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              draggable={false}
              href={href}
              aria-label={`Switch to ${workspace.name}`}
              className={tileClass(active)}
            >
              <TileFace workspace={workspace} active={active} />
            </Link>
          }
        />
        <TooltipContent side="right">
          {workspace.name}
          <span className="text-muted-foreground">· {workspace.role}</span>
        </TooltipContent>
      </Tooltip>
      {badge !== null && (
        <span className="pointer-events-none absolute -top-1 right-2 z-10 flex size-4 items-center justify-center rounded-full border-[1.5px] border-panel bg-primary font-mono text-[9px] font-medium text-primary-foreground">
          {badge}
        </span>
      )}
    </div>
  );
}

export function WorkspaceRailSwitcher() {
  const router = useRouter();
  const { workspaces, activeId, loaded, reorder } = useWorkspaces();
  const { altHeld } = useWorkspaceHotkeys();
  const { pathname } = useWorkspacePath();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!activeId) return;
    scrollRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = workspaces.map((w) => w.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    reorder(arrayMove(ids, from, to));
  }

  const dragging = workspaces.find((w) => w.id === draggingId) ?? null;

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col items-center gap-1.5">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        autoScroll={{ threshold: { x: 0, y: 0.25 } }}
        onDragStart={(e: DragStartEvent) => setDraggingId(String(e.active.id))}
        onDragCancel={() => setDraggingId(null)}
        onDragEnd={onDragEnd}
      >
        <div
          ref={scrollRef}
          className="w-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ maskImage: SCROLL_MASK, WebkitMaskImage: SCROLL_MASK }}
        >
          <div className="flex flex-col items-center gap-1.5 pt-1.5 pb-4">
            {!loaded && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface">
                <Loader2 className="size-4 animate-spin text-faint" />
              </div>
            )}
            <SortableContext
              items={workspaces.map((w) => w.id)}
              strategy={verticalListSortingStrategy}
            >
              {workspaces.map((w, index) => (
                <SortableTile
                  key={w.id}
                  workspace={w}
                  active={w.id === activeId}
                  badge={altHeld && index < HOTKEY_MAX ? index + 1 : null}
                  href={switchWorkspaceHref(pathname, w)}
                />
              ))}
            </SortableContext>
          </div>
        </div>
        <DragOverlay>
          {dragging ? (
            <div className={cn(tileClass(dragging.id === activeId), "cursor-grabbing shadow-lg")}>
              <TileFace workspace={dragging} active={dragging.id === activeId} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Tooltip>
        <CreateWorkspaceDialog
          onCreated={(created) => {
            invalidateWorkspaces();
            router.push(onboardingPath(created.slug));
          }}
          trigger={
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="New workspace"
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-border text-faint transition-colors hover:bg-hover hover:text-muted-foreground"
                >
                  <Plus className="size-4" strokeWidth={1.8} />
                </button>
              }
            />
          }
        />
        <TooltipContent side="right">New workspace</TooltipContent>
      </Tooltip>
    </div>
  );
}

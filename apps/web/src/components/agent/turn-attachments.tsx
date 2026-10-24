"use client";

import { Button } from "@metis/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@metis/ui/components/command";
import { Popover, PopoverContent, PopoverTrigger } from "@metis/ui/components/popover";
import { cn } from "@metis/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Paperclip, Pin, X } from "lucide-react";
import { useCallback, useState } from "react";

export interface TrayEntry<T> {
  item: T;
  origin: "open" | "dragged";
}

export function useAttachmentTray<T extends { id: string }>(open: T | null) {
  const [entries, setEntries] = useState<TrayEntry<T>[]>([]);
  const [syncedOpen, setSyncedOpen] = useState<T | null>(null);

  if (open !== syncedOpen) {
    setSyncedOpen(open);
    setEntries((prev) => {
      const dragged = prev.filter((e) => e.origin === "dragged");
      const unchanged = dragged.length === prev.length;
      if (!open) return unchanged ? prev : dragged;
      if (dragged.some((e) => e.item.id === open.id)) {
        return unchanged ? prev : dragged;
      }
      return [...dragged, { item: open, origin: "open" }];
    });
  }

  const add = useCallback((item: T) => {
    setEntries((prev) => [
      ...prev.filter((e) => e.item.id !== item.id),
      { item, origin: "dragged" },
    ]);
  }, []);

  const pin = useCallback((id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.item.id === id ? { item: e.item, origin: "dragged" } : e)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.item.id !== id));
  }, []);

  const reset = useCallback(() => setEntries([]), []);

  return { entries, add, pin, remove, reset };
}

export interface AttachmentChip {
  id: string;
  title: string;
  subtitle?: string;
  origin?: "open" | "dragged";
}

export function AttachmentDropZone({
  className,
  isOver,
  label,
  visible,
}: {
  className?: string;
  isOver: boolean;
  label: string;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-3 text-[12px] transition-colors",
        isOver ? "border-primary bg-brand-soft text-brand-text" : "border-border text-faint",
        className,
      )}
    >
      <Paperclip className="size-3.5 shrink-0" strokeWidth={1.75} />
      {label}
    </div>
  );
}

export function AttachmentPicker({
  disabled,
  emptyLabel,
  icon: Icon,
  items,
  onPick,
  placeholder,
  title,
}: {
  disabled?: boolean;
  emptyLabel: string;
  icon: LucideIcon;
  items: AttachmentChip[];
  onPick: (id: string) => void;
  placeholder: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={title}
            disabled={disabled}
            size="icon-sm"
            title={title}
            variant="ghost"
          >
            <Paperclip className="size-4" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => {
                    onPick(item.id);
                    setOpen(false);
                  }}
                  value={`${item.title} ${item.subtitle ?? ""}`}
                >
                  <Icon className="size-3.5 shrink-0 text-faint" strokeWidth={1.75} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[12px] text-foreground">{item.title}</span>
                    {item.subtitle && (
                      <span className="truncate text-[11px] text-faint">{item.subtitle}</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function AttachmentChips({
  chips,
  className,
  collapseAfter = 3,
  icon: Icon,
  onClear,
  onOpen,
  onPin,
  onRemove,
  variant = "tray",
}: {
  chips: AttachmentChip[];
  className?: string;
  collapseAfter?: number;
  icon: LucideIcon;
  onClear?: () => void;
  onOpen?: (id: string) => void;
  onPin?: (id: string) => void;
  onRemove?: (id: string) => void;
  variant?: "tray" | "transcript";
}) {
  const [expanded, setExpanded] = useState(false);

  if (chips.length === 0) return null;

  const hidden = expanded ? 0 : Math.max(0, chips.length - collapseAfter);
  const shown = hidden > 0 ? chips.slice(0, collapseAfter) : chips;
  const tray = variant === "tray";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {tray && (
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] text-faint">{chips.length} attached</span>
          {onClear && (
            <button
              className="text-[11px] text-faint transition-colors hover:text-foreground"
              onClick={onClear}
              type="button"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {shown.map((chip) => {
          const implicit = chip.origin === "open";
          return (
            <span
              className={cn(
                "group/chip flex min-w-0 max-w-40 items-center gap-1 rounded-md",
                tray
                  ? cn(
                      "border px-1.5 py-1",
                      implicit
                        ? "border-border border-dashed bg-transparent"
                        : "border-border bg-surface",
                    )
                  : "bg-surface/60 px-1.5 py-0.5",
              )}
              key={chip.id}
            >
              <Icon
                className={cn("shrink-0 text-faint", tray ? "size-3" : "size-2.5")}
                strokeWidth={1.75}
              />
              <button
                className={cn(
                  "min-w-0 flex-1 truncate text-left text-foreground",
                  tray ? "text-[12px]" : "text-[11px]",
                  onOpen && "hover:underline",
                )}
                disabled={!onOpen}
                onClick={() => onOpen?.(chip.id)}
                title={chip.subtitle ? `${chip.title} — ${chip.subtitle}` : chip.title}
                type="button"
              >
                {chip.title}
              </button>
              {tray && implicit && onPin && (
                <button
                  aria-label={`Keep “${chip.title}” attached`}
                  className="shrink-0 text-faint opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/chip:opacity-100 pointer-coarse:opacity-100"
                  onClick={() => onPin(chip.id)}
                  title="Keep attached while you browse"
                  type="button"
                >
                  <Pin className="size-3" />
                </button>
              )}
              {tray && onRemove && (
                <button
                  aria-label={`Remove “${chip.title}”`}
                  className="shrink-0 text-faint transition-colors hover:text-foreground"
                  onClick={() => onRemove(chip.id)}
                  type="button"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          );
        })}

        {hidden > 0 && (
          <button
            className="rounded-md border border-border border-dashed px-1.5 py-1 text-[11px] text-faint transition-colors hover:text-foreground"
            onClick={() => setExpanded(true)}
            type="button"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { Popover } from "@base-ui/react/popover";
import { cn } from "@metis/ui/lib/utils";
import { AtSign } from "lucide-react";
import { useMemo } from "react";

import {
  REFERENCE_TYPE_HEADING,
  type ReferenceType,
  type ResolvedReference,
} from "@/ai/references";

import { ReferenceIcon } from "./reference-chip";

export interface ReferenceMenuState {
  open: boolean;
  items: ResolvedReference[];
  index: number;
  loading: boolean;
  query: string;
  getRect: (() => DOMRect | null) | null;
}

export function ReferenceMenu({
  state,
  onSelect,
  onClose,
}: {
  state: ReferenceMenuState;
  onSelect: (item: ResolvedReference) => void;
  onClose: () => void;
}) {
  const { getRect } = state;

  const anchor = useMemo(
    () => (getRect ? { getBoundingClientRect: () => getRect() ?? new DOMRect() } : null),
    [getRect],
  );

  let lastType: ReferenceType | null = null;

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={state.open}
    >
      <Popover.Portal>
        <Popover.Positioner
          align="start"
          anchor={anchor}
          className="isolate z-50"
          side="top"
          sideOffset={8}
        >
          <Popover.Popup
            className="w-80 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
            finalFocus={false}
            initialFocus={false}
          >
            <div className="flex items-center gap-1.5 border-border-soft border-b px-2 py-1 text-[11px] text-faint">
              <AtSign className="size-3" />
              <span className="truncate">
                {state.query ? `“${state.query}”` : "Reference a mailbox, person, email…"}
              </span>
              {state.loading && <span className="ml-auto shrink-0">Searching…</span>}
            </div>

            <div
              aria-label="Insert a reference"
              className="max-h-64 overflow-y-auto py-0.5"
              role="listbox"
            >
              {state.items.length === 0 ? (
                <p className="px-2 py-2 text-[12px] text-muted-foreground">
                  {state.loading ? "Searching…" : "Nothing matches yet."}
                </p>
              ) : (
                state.items.map((item, index) => {
                  const heading = item.type === lastType ? null : REFERENCE_TYPE_HEADING[item.type];
                  lastType = item.type;
                  const selected = index === state.index;
                  return (
                    <div key={`${item.type}:${item.id}`}>
                      {heading && (
                        <p className="px-2 pt-1.5 pb-0.5 font-medium text-[11px] text-faint">
                          {heading}
                        </p>
                      )}
                      <button
                        aria-selected={selected}
                        className={cn(
                          "flex w-full items-center gap-2 px-2 py-1 text-left",
                          selected ? "bg-surface" : "bg-transparent",
                        )}
                        onClick={() => onSelect(item)}
                        onMouseDown={(e) => e.preventDefault()}
                        role="option"
                        type="button"
                      >
                        <ReferenceIcon className="size-3.5 shrink-0 text-faint" type={item.type} />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                          {item.label}
                        </span>
                        {item.detail && (
                          <span className="max-w-[45%] shrink-0 truncate text-[11px] text-faint">
                            {item.detail}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

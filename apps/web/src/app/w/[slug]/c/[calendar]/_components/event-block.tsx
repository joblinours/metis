"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@metis/ui/lib/utils";
import { differenceInMinutes } from "date-fns";
import type { CSSProperties } from "react";

import { eventEnd, eventStart, formatEventTime, isPast } from "@/calendar/layout";
import type { CalendarEvent } from "@/types/calendar";

import { useCalendar } from "./calendar-context";

export function EventBlock({ event, color }: { event: CalendarEvent; color: string }) {
  const { setSelected } = useCalendar();

  const {
    attributes: moveAttributes,
    listeners: moveListeners,
    setNodeRef: setMoveNode,
    isDragging: moving,
  } = useDraggable({ id: event.id, data: { event, mode: "move" } });
  const {
    attributes: resizeAttributes,
    listeners: resizeListeners,
    setNodeRef: setResizeNode,
    isDragging: resizing,
  } = useDraggable({
    id: `${event.id}::resize`,
    data: { event, mode: "resize" },
  });

  const minutes = differenceInMinutes(eventEnd(event), eventStart(event));
  const dragging = moving || resizing;

  const style: CSSProperties = {
    backgroundColor: color,
    opacity: dragging ? 0.4 : isPast(event) ? 0.6 : 1,
  };

  return (
    <div
      ref={setMoveNode}
      style={style}
      className={cn(
        "relative flex h-full w-full select-none flex-col gap-0.5 overflow-hidden rounded-[4px] px-1.5 text-white/95",
        minutes < 35 ? "justify-center py-0" : "py-1",
      )}
      {...moveAttributes}
      {...moveListeners}
    >
      <button
        type="button"
        onClick={() => setSelected(event)}
        className="flex flex-col items-start text-left"
      >
        <span
          className={cn(
            "truncate text-[11px] font-medium leading-tight",
            event.status === "cancelled" && "line-through",
          )}
        >
          {event.title}
        </span>
        {minutes > 25 && (
          <span className="truncate text-[10px] leading-tight opacity-85">
            {formatEventTime(event)}
          </span>
        )}
      </button>

      <button
        ref={setResizeNode}
        type="button"
        aria-label={`Resize ${event.title}`}
        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
        {...resizeAttributes}
        {...resizeListeners}
      />
    </div>
  );
}

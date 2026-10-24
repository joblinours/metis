"use client";

import { Button } from "@metis/ui/components/button";
import { Calendar } from "@metis/ui/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@metis/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { format, isSameDay, setHours, setMinutes, startOfDay } from "date-fns";
import { useMemo, useState } from "react";

const SLOT_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

export function DatePicker({
  value,
  onChange,
  label,
}: {
  value: Date;
  onChange: (next: Date) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button aria-label={label} variant="outline" className="font-normal">
            {format(value, "EEE, MMM d")}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(next) => {
            if (!next) return;
            onChange(setMinutes(setHours(next, value.getHours()), value.getMinutes()));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export function TimePicker({
  value,
  onChange,
  label,
  after,
}: {
  value: Date;
  onChange: (next: Date) => void;
  label: string;
  after?: Date;
}) {
  const items = useMemo(() => {
    const base = startOfDay(value);
    const list: { value: string; label: string }[] = [];
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      const minutes = slot * SLOT_MINUTES;
      const at = setMinutes(base, minutes);
      if (after && isSameDay(after, value) && at <= after) continue;
      list.push({ value: String(minutes), label: format(at, "h:mm a") });
    }
    const current = value.getHours() * 60 + value.getMinutes();
    if (!list.some((item) => item.value === String(current))) {
      list.unshift({ value: String(current), label: format(value, "h:mm a") });
    }
    return list;
  }, [value, after]);

  return (
    <Select
      items={items}
      value={String(value.getHours() * 60 + value.getMinutes())}
      onValueChange={(next) => {
        const minutes = Number(next);
        onChange(setMinutes(startOfDay(value), minutes));
      }}
    >
      <SelectTrigger aria-label={label} className="w-[7.5rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

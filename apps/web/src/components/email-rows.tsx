"use client";

import { Button } from "@metis/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@metis/ui/components/input-group";
import { Mail, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { emailAddressSchema } from "@/server/schema";

const SEPARATORS = /[,;\s]+/;

export function validateEmailRows<T extends { email: string }>(
  rows: T[],
): { rows: T[]; error: string | null } {
  const filled = rows
    .map((r) => ({ ...r, email: r.email.trim().toLowerCase() }))
    .filter((r) => r.email.length > 0);
  const invalid = filled.filter((r) => !emailAddressSchema.safeParse(r.email).success);
  if (invalid.length > 0) {
    return {
      rows: [],
      error: `Not a valid email: ${invalid.map((r) => r.email).join(", ")}`,
    };
  }
  const seen = new Set<string>();
  for (const r of filled) {
    if (seen.has(r.email)) {
      return { rows: [], error: `Duplicate email: ${r.email}` };
    }
    seen.add(r.email);
  }
  return { rows: filled, error: null };
}

export function EmailRows<T extends { email: string }>({
  rows,
  onChange,
  emptyRow,
  disabled,
  placeholder = "name@example.com",
  label = "Email",
  addLabel = "Add another",
  renderSuffix,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  emptyRow: T;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  addLabel?: string;
  renderSuffix?: (row: T, index: number) => React.ReactNode;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    pendingFocus.current = null;
    inputs.current[index]?.focus();
  });

  function insertAfter(index: number, emails: string[]) {
    const next = [...rows];
    next.splice(index + 1, 0, ...emails.map((email) => ({ ...emptyRow, email })));
    onChange(next);
    pendingFocus.current = index + emails.length;
  }

  function update(index: number, email: string) {
    onChange(rows.map((r, i) => (i === index ? { ...r, email } : r)));
  }

  function handlePaste(index: number, event: React.ClipboardEvent) {
    const parts = event.clipboardData
      .getData("text")
      .split(SEPARATORS)
      .map((value) => value.trim())
      .filter(Boolean);
    if (parts.length < 2) return;
    event.preventDefault();
    const next = rows.map((r, i) => (i === index ? { ...r, email: parts[0] } : r));
    next.splice(index + 1, 0, ...parts.slice(1).map((email) => ({ ...emptyRow, email })));
    onChange(next);
    pendingFocus.current = index + parts.length - 1;
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div
          // oxlint-disable-next-line react/no-array-index-key --rows are positional editors with no stable identity
          key={index}
          className="flex items-center gap-2"
        >
          <InputGroup className="min-w-0 flex-1">
            <InputGroupAddon>
              <Mail className="size-3.5 text-faint" />
            </InputGroupAddon>
            <InputGroupInput
              className="text-[13px]"
              ref={(node) => {
                inputs.current[index] = node;
              }}
              type="email"
              value={row.email}
              onChange={(e) => update(index, e.target.value)}
              onPaste={(e) => handlePaste(index, e)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                insertAfter(index, [""]);
              }}
              placeholder={placeholder}
              disabled={disabled}
              aria-label={`${label} ${index + 1}`}
            />
          </InputGroup>
          {renderSuffix?.(row, index)}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || rows.length === 1}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            className="shrink-0"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => insertAfter(rows.length - 1, [""])}
        className="self-start"
      >
        <Plus className="size-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

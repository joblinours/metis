"use client";

import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { Switch } from "@metis/ui/components/switch";
import { cn } from "@metis/ui/lib/utils";

import type { DashboardConfigField, DashboardConfigValue, DashboardSecret } from "@/server/schema";

export type Values = Record<string, DashboardConfigValue>;
export type Secrets = Record<string, DashboardSecret>;

function text(value: DashboardConfigValue | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export function fieldDirty(
  field: DashboardConfigField,
  value: DashboardConfigValue | undefined,
  initial: DashboardConfigValue | undefined,
): boolean {
  if (field.kind === "secret") {
    return value === null || (typeof value === "string" && value !== "");
  }
  if (field.kind === "boolean") return (value === true) !== (initial === true);
  return text(value) !== text(initial);
}

function visible(field: DashboardConfigField, values: Values): boolean {
  if (!field.when) return true;
  const controlling = values[field.when.key];
  return typeof controlling === "string" && field.when.values.includes(controlling);
}

function FieldInput({
  field,
  id,
  value,
  secret,
  onChange,
}: {
  field: DashboardConfigField;
  id: string;
  value: DashboardConfigValue | undefined;
  secret: DashboardSecret | undefined;
  onChange: (value: DashboardConfigValue | undefined) => void;
}) {
  switch (field.kind) {
    case "boolean":
      return (
        <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
      );
    case "select": {
      const items = (field.options ?? []).map((option) => ({
        value: option,
        label: option,
      }));
      return (
        <Select
          items={items}
          value={typeof value === "string" ? value : null}
          onValueChange={(next) => onChange(next ?? null)}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      );
    }
    case "secret": {
      const cleared = value === null;
      const kept = secret?.set ? `Unchanged${secret.hint ? ` (…${secret.hint})` : ""}` : "Not set";
      return (
        <div className="flex items-center gap-2">
          <Input
            className="text-[13px]"
            id={id}
            type="password"
            autoComplete="new-password"
            placeholder={cleared ? "Will be removed" : kept}
            disabled={cleared}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {secret?.set && field.optional && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(cleared ? undefined : null)}
            >
              {cleared ? "Keep" : "Remove"}
            </Button>
          )}
        </div>
      );
    }
    default:
      return (
        <Input
          className="text-[13px]"
          id={id}
          type={field.kind === "number" ? "number" : field.kind === "url" ? "url" : "text"}
          autoComplete="off"
          value={text(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function ConfigFieldRows({
  idPrefix,
  fields,
  values,
  initial,
  secrets,
  onChange,
}: {
  idPrefix: string;
  fields: DashboardConfigField[];
  values: Values;
  initial: Values;
  secrets: Secrets;
  onChange: (key: string, value: DashboardConfigValue | undefined) => void;
}) {
  return (
    <div className="divide-y divide-border">
      {fields
        .filter((field) => visible(field, values))
        .map((field) => {
          const id = `${idPrefix}-${field.key}`;
          const changed = fieldDirty(field, values[field.key], initial[field.key]);
          const boolean = field.kind === "boolean";
          return (
            <div
              key={field.key}
              className={cn(
                "flex justify-between gap-x-6 gap-y-1.5 py-2",
                boolean ? "items-center" : "items-start max-sm:flex-col max-sm:items-stretch",
              )}
            >
              <div className={cn("min-w-0", !boolean && "sm:pt-1.5")}>
                <label
                  htmlFor={id}
                  className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
                >
                  {changed && (
                    <span className="size-1.5 shrink-0 rounded-full bg-brand" title="Changed" />
                  )}
                  {field.label}
                  {field.optional && <span className="text-[11px] text-faint">optional</span>}
                  {changed && <span className="sr-only">(changed)</span>}
                </label>
                {field.description && (
                  <p className="mt-0.5 text-[11px] text-faint">{field.description}</p>
                )}
              </div>
              <div className={cn("shrink-0", boolean ? "flex justify-end" : "w-72 max-sm:w-full")}>
                <FieldInput
                  field={field}
                  id={id}
                  value={values[field.key]}
                  secret={secrets[field.key]}
                  onChange={(value) => onChange(field.key, value)}
                />
              </div>
            </div>
          );
        })}
    </div>
  );
}

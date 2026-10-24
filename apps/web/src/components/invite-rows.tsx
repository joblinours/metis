"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";

import { orpc } from "@/lib/orpc";

import { EmailRows } from "./email-rows";

export type InviteRole = "member" | "admin";

export interface InviteRow {
  email: string;
  role: InviteRole;
}

export const EMPTY_INVITE_ROW: InviteRow = { email: "", role: "member" };

const ROLE_ITEMS: { value: InviteRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

export async function sendInvites(
  workspaceSlug: string,
  invites: InviteRow[],
): Promise<InviteRow[]> {
  const results = await Promise.allSettled(
    invites.map((invite) =>
      orpc.workspaces.createInvite({
        workspaceSlug,
        email: invite.email,
        role: invite.role,
      }),
    ),
  );
  return invites.filter((_, i) => results[i]?.status === "rejected");
}

export function InviteRows({
  rows,
  onChange,
  disabled,
}: {
  rows: InviteRow[];
  onChange: (rows: InviteRow[]) => void;
  disabled?: boolean;
}) {
  return (
    <EmailRows
      rows={rows}
      onChange={onChange}
      emptyRow={EMPTY_INVITE_ROW}
      disabled={disabled}
      placeholder="teammate@example.com"
      label="Invite email"
      renderSuffix={(row, index) => (
        <Select
          items={ROLE_ITEMS}
          value={row.role}
          disabled={disabled}
          onValueChange={(value) => {
            if (value === "member" || value === "admin") {
              onChange(rows.map((r, i) => (i === index ? { ...r, role: value } : r)));
            }
          }}
        >
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ROLE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    />
  );
}

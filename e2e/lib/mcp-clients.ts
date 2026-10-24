import { z } from "zod";

export const TOOL_GROUPS = [
  "reads",
  "mail",
  "inbox",
  "labels",
  "drive",
  "calendar",
  "workflows",
  "account",
] as const;

export type ToolGroup = (typeof TOOL_GROUPS)[number];

export const CHECK_CLIENTS = ["checks-1", "checks-2", "checks-3", "checks-4"] as const;

export const OWNER_CLIENTS = [...TOOL_GROUPS, ...CHECK_CLIENTS, "defaults"] as const;

export type OwnerClient = (typeof OWNER_CLIENTS)[number];

export const ALL_TOOLS_ON: ReadonlySet<OwnerClient> = new Set([...TOOL_GROUPS, ...CHECK_CLIENTS]);

export const MCP_CLIENT_REDIRECT = "http://127.0.0.1:47801/callback";

export function clientLabel(name: string): string {
  return `e2e ${name}`;
}

export const seededMcpClientSchema = z.object({
  clientId: z.string(),
  token: z.string(),
});
export type SeededMcpClient = z.infer<typeof seededMcpClientSchema>;

export const ownerClientsSchema = z.record(z.enum(OWNER_CLIENTS), seededMcpClientSchema);

export const memberEnrollmentSchema = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
  workspaceSlug: z.string(),
  totpURI: z.string(),
  mcpClient: seededMcpClientSchema,
});
export type MemberEnrollment = z.infer<typeof memberEnrollmentSchema>;

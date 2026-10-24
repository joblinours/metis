import { z } from "zod";

import { memberEnrollmentSchema, ownerClientsSchema } from "./mcp-clients";

export const enrollmentSchema = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
  workspaceSlug: z.string(),
  mailboxSlug: z.string(),
  calendarSlug: z.string(),
  driveSlugs: z.record(z.string(), z.string()),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
  mcpClients: ownerClientsSchema,
  member: memberEnrollmentSchema,
});
export type Enrollment = z.infer<typeof enrollmentSchema>;

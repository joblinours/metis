import "server-only";
import { ORPCError } from "@orpc/server";

import { adapterForMailbox } from "@/mail/aggregate";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  deleteDraftInputSchema,
  deleteDraftOutputSchema,
  saveDraftInputSchema,
  saveDraftOutputSchema,
} from "@/server/schema";

import { resolveSender } from "./sender";

export const draftsRouter = {
  save: mailSession(saveDraftInputSchema)
    .output(saveDraftOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const from = await resolveSender(mail, input.fromMailboxSlug);
      const adapter = await adapterForMailbox(from);

      try {
        if (input.draftId) {
          if (from.provider === "zoho") {
            const { id } = await adapter.createDraft(input.payload);
            try {
              await adapter.deleteDraft(input.draftId);
            } catch {}
            return { id };
          }
          return await adapter.updateDraft(input.draftId, input.payload);
        }

        const { id } = await adapter.createDraft(input.payload);
        return { id };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  delete: mailSession(deleteDraftInputSchema)
    .output(deleteDraftOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;
      const from = await resolveSender(mail, input.fromMailboxSlug);
      const adapter = await adapterForMailbox(from);

      try {
        await adapter.deleteDraft(input.draftId);
        return { success: true as const };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),
};

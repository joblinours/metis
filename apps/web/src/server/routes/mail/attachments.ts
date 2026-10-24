import "server-only";
import { ORPCError } from "@orpc/server";

import { mailSession } from "@/server/middlewares/mail-session";
import {
  downloadAttachmentInputSchema,
  downloadAttachmentOutputSchema,
  listAttachmentsInputSchema,
  listAttachmentsOutputSchema,
} from "@/server/schema";

export const attachmentsRouter = {
  list: mailSession(listAttachmentsInputSchema)
    .output(listAttachmentsOutputSchema)
    .handler(async ({ input, context }) => {
      try {
        const attachments = await context.mail.adapter.listAttachments(input.id);
        return { attachments };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  download: mailSession(downloadAttachmentInputSchema)
    .output(downloadAttachmentOutputSchema)
    .handler(async ({ input, context }) => {
      let result: Awaited<ReturnType<typeof context.mail.adapter.downloadAttachment>>;
      try {
        result = await context.mail.adapter.downloadAttachment(input.id, input.attachmentId);
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
      if (!result) {
        throw new ORPCError("NOT_FOUND", {
          message: "That attachment is no longer available",
        });
      }
      return {
        data: result.buffer.toString("base64"),
        mimeType: result.mimeType ?? input.mimeType,
        filename: input.filename,
        size: result.buffer.length,
      };
    }),
};

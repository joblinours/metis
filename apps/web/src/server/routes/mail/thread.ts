import "server-only";
import { ORPCError } from "@orpc/server";

import { mailSession } from "@/server/middlewares/mail-session";
import { getThreadInputSchema, getThreadOutputSchema } from "@/server/schema";

export const threadRouter = {
  get: mailSession(getThreadInputSchema)
    .output(getThreadOutputSchema)
    .handler(async ({ input, context }) => {
      const { mail } = context;

      try {
        const messages = await mail.adapter.getThread(input.threadId);
        return { messages };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),
};

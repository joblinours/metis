import { generateSmartReplies } from "../../../../src/mail/smart-replies";
import { eachLimited, Failures, loadWorld, type StepContext } from "./context";

const LANES = 4;

export async function run(ctx: StepContext): Promise<void> {
  const { mail } = ctx.session;
  const { inbox } = await loadWorld(ctx);
  const failures = new Failures();
  await eachLimited(
    inbox.filter((e) => e.folder === "inbox"),
    LANES,
    async (email) => {
      await failures.attempt(`smart replies "${email.subject}"`, async () => {
        const replies = await generateSmartReplies(mail, {
          id: email.id,
          sender: email.fromName || email.from,
          subject: email.subject,
          snippet: email.snippet,
        });
        console.log(`[record] ${replies.length} smart replies for "${email.subject}"`);
      });
    },
  );
  failures.throwIfAny();
}

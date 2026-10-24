import { type NodeKindDefinition, SINGLE_OUTPUT, SINGLE_OUTPUT_ERROR } from "./types";

export const triggerNewMail: NodeKindDefinition<"trigger.newMail"> = {
  kind: "trigger.newMail",
  label: "When mail arrives",
  scope: "any",
  retry: "safe",
  input: null,
  output: () => "signal",
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
  check(node, ctx) {
    const sources = ctx
      .outgoing(node.id)
      .map((id) => ctx.byId.get(id))
      .filter((n) => n?.kind === "mailbox.source");
    if (sources.length !== 1) {
      return ["Connect this trigger to exactly one mailbox step that provides incoming mail"];
    }
    const source = sources[0];
    if (source?.kind === "mailbox.source" && source.operation !== "incoming") {
      return ["A mailbox fed by the new-mail trigger must provide incoming mail"];
    }
    return [];
  },
};

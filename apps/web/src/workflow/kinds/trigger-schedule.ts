import { validCron, validTimezone } from "../cron";
import { type NodeKindDefinition, SINGLE_OUTPUT, SINGLE_OUTPUT_ERROR } from "./types";

export const triggerSchedule: NodeKindDefinition<"trigger.schedule"> = {
  kind: "trigger.schedule",
  label: "On a schedule",
  scope: "any",
  retry: "safe",
  input: null,
  output: () => "signal",
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
  check(node) {
    if (!validTimezone(node.timezone)) {
      return [`"${node.timezone}" is not a known time zone`];
    }
    if (!validCron(node.cron, node.timezone)) {
      return ["Use a five-field cron expression, for example 0 9 * * 1-5"];
    }
    return [];
  },
};

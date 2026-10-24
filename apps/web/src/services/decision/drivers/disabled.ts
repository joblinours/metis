import "server-only";
import type { DecisionDriver } from "../types";

function unreachable(): never {
  throw new Error(
    "Decision models are disabled (the decision driver is disabled) — this call should have been gated before reaching the model",
  );
}

export function createDisabledDecisionDriver(): DecisionDriver {
  return {
    kind: "disabled",
    model: {
      specificationVersion: "v4",
      provider: "disabled",
      modelId: "disabled-decision",
      supportedQuestionTypes: [],
      doDecide: unreachable,
    },
  };
}

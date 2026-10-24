import type { Experimental_DecisionModelV4 } from "@ai-sdk/provider";

export type DecisionDriverKind = "systemone" | "openai" | "disabled";

export interface DecisionDriver {
  kind: DecisionDriverKind;
  model: Experimental_DecisionModelV4;
}

import "server-only";
import {
  type ProcessInputStepArgs,
  type Processor,
  ToolSearchProcessor,
} from "@mastra/core/processors";

import { decisionEnabled } from "@/services/decision";
import { phishingDetectionEnabled } from "@/services/phishing-detection";

import { type SearchableTools, workspaceSearchableTools } from "./tools/workspace-tools";

function toolSearch(tools: SearchableTools) {
  return new ToolSearchProcessor({
    tools,
    storage: "context",
    search: {
      topK: 5,
      minScore: 2,
      autoLoad: true,
    },
  });
}

function toolSearches(rosters: typeof workspaceSearchableTools.withPhishingDetection) {
  return {
    withDecisionSteps: toolSearch(rosters.withDecisionSteps),
    withoutDecisionSteps: toolSearch(rosters.withoutDecisionSteps),
  };
}

const toolSearchWithPhishingDetection = toolSearches(
  workspaceSearchableTools.withPhishingDetection,
);
const toolSearchWithoutPhishingDetection = toolSearches(
  workspaceSearchableTools.withoutPhishingDetection,
);

export function workspaceToolSearch(): ToolSearchProcessor {
  const searches = phishingDetectionEnabled()
    ? toolSearchWithPhishingDetection
    : toolSearchWithoutPhishingDetection;
  return decisionEnabled("workflowNode")
    ? searches.withDecisionSteps
    : searches.withoutDecisionSteps;
}

export const sortedTools = {
  id: "sorted-tools",
  processInputStep: ({ tools }: ProcessInputStepArgs) => ({
    tools: Object.fromEntries(
      Object.entries(tools ?? {}).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  }),
} satisfies Processor<"sorted-tools">;

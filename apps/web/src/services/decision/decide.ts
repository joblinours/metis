import "server-only";
import {
  APICallError,
  type Experimental_DecisionQuestion,
  Experimental_DecisionRefusalError,
  type Experimental_DecisionResult,
  type Experimental_DecisionState,
  Experimental_DecisionUnsupportedQuestionTypeError,
  experimental_decide,
} from "ai";

import { getDecision } from "./registry";

export class DecisionConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DecisionConfigError";
  }
}

export function decisionUsageProvider(): string {
  return `decision:${getDecision().kind}`;
}

export type DecideOutcome<QUESTIONS extends Record<string, Experimental_DecisionQuestion>> =
  | { refused: true }
  | {
      refused: false;
      answers: Experimental_DecisionResult<QUESTIONS>["answers"];
      usage: Experimental_DecisionResult<QUESTIONS>["usage"];
      modelId: string;
    };

export async function decideOne<
  const QUESTIONS extends Record<string, Experimental_DecisionQuestion>,
>({
  state,
  questions,
  signal,
}: {
  state: Experimental_DecisionState;
  questions: QUESTIONS;
  signal?: AbortSignal;
}): Promise<DecideOutcome<QUESTIONS>> {
  try {
    const result = await experimental_decide({
      model: getDecision().model,
      state,
      questions,
      maxRetries: 0,
      abortSignal: signal,
    });
    return {
      refused: false,
      answers: result.answers,
      usage: result.usage,
      modelId: result.response.modelId,
    };
  } catch (err) {
    if (Experimental_DecisionRefusalError.isInstance(err)) {
      return { refused: true };
    }
    if (Experimental_DecisionUnsupportedQuestionTypeError.isInstance(err)) {
      throw new DecisionConfigError(
        `the decision model does not support ${err.questionType} questions`,
        { cause: err },
      );
    }
    if (APICallError.isInstance(err) && (err.statusCode === 401 || err.statusCode === 403)) {
      throw new DecisionConfigError(
        `the decision provider rejected the API key (${err.statusCode})`,
        { cause: err },
      );
    }
    throw err;
  }
}

export interface DecisionOption<KEY extends string> {
  key: KEY;
  name: string;
  description?: string | null;
}

export interface NeutralCriteria<KEY extends string> {
  criteria: Record<string, string>;
  idOf: Map<KEY, string>;
  keyOf: Map<string, KEY>;
}

export function neutralCriteria<KEY extends string>(
  options: readonly DecisionOption<KEY>[],
  prefix = "o",
): NeutralCriteria<KEY> {
  const criteria: Record<string, string> = {};
  const idOf = new Map<KEY, string>();
  const keyOf = new Map<string, KEY>();
  for (const [index, option] of options.entries()) {
    const id = `${prefix}${index + 1}`;
    criteria[id] = option.description ? `${option.name}: ${option.description}` : option.name;
    idOf.set(option.key, id);
    keyOf.set(id, option.key);
  }
  return { criteria, idOf, keyOf };
}

export function topChoice(
  answer: { probabilities?: Record<string, number> },
  min: number,
): { id: string; probability: number } | null {
  let top: { id: string; probability: number } | null = null;
  for (const [id, probability] of Object.entries(answer.probabilities ?? {})) {
    if (!top || probability > top.probability) top = { id, probability };
  }
  return top && top.probability >= min ? top : null;
}

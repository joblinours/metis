import type { TickFailure, TickStage } from "./runtime";

const MAX_DEPTH = 5;

function codeOf(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_DEPTH && current; depth += 1) {
    if (typeof current !== "object") break;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function nameOf(err: unknown): string {
  let current: unknown = err;
  let name = "Error";
  for (let depth = 0; depth < MAX_DEPTH && current; depth += 1) {
    if (!(current instanceof Error)) break;
    name = current.name;
    if (!current.cause) break;
    current = current.cause;
  }
  return name;
}

export function errorCode(err: unknown): string {
  return codeOf(err) ?? nameOf(err);
}

export function tickFailure(stage: TickStage, err: unknown): TickFailure {
  return { stage, code: errorCode(err) };
}

export function formatTickFailure(failure: TickFailure): string {
  return `${failure.stage} failed: ${failure.code}`;
}

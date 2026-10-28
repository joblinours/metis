import "server-only";
import type { StepKey } from "../steps";
import { AI_RUNNERS } from "./ai";
import { LOGIC_RUNNERS } from "./logic";
import { MAIL_RUNNERS } from "./mail";
import { RESOURCE_RUNNERS } from "./resources";
import type { Runner } from "./types";

type RunnableKey = Exclude<StepKey, `trigger.${string}`>;

const RUNNERS: { [K in RunnableKey]: Runner } = {
  ...MAIL_RUNNERS,
  ...LOGIC_RUNNERS,
  ...AI_RUNNERS,
  ...RESOURCE_RUNNERS,
};

const BY_KEY = new Map<string, Runner>(Object.entries(RUNNERS));

export function runnerFor(step: string): Runner | null {
  return BY_KEY.get(step) ?? null;
}

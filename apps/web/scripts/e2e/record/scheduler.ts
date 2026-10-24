import { type Scenario, SLOTS } from "./catalog";

export type Status = "ok" | "failed" | "timed out" | "blocked" | "interrupted" | "needs recording";

export interface Outcome {
  status: Status;
  error?: string;
  ms: number;
}

function overlaps(a: string[], b: string[]): boolean {
  return a.some((item) => b.includes(item));
}

function conflicts(a: Scenario, b: Scenario): boolean {
  return (
    overlaps(a.writes, [...b.reads, ...b.writes]) || overlaps(b.writes, [...a.reads, ...a.writes])
  );
}

export async function schedule(
  scenarios: Scenario[],
  options: {
    jobs: number;
    stopped: () => boolean;
    run: (scenario: Scenario) => Promise<Outcome>;
  },
): Promise<Map<string, Outcome>> {
  const done = new Map<string, Outcome>();
  const pending = [...scenarios];
  const running = new Map<string, { scenario: Scenario; job: Promise<void> }>();

  const slotFree = (scenario: Scenario) =>
    scenario.slots.every(
      (slot) =>
        [...running.values()].filter((r) => r.scenario.slots.includes(slot)).length <
        (SLOTS[slot] ?? 1),
    );

  while (pending.length > 0 || running.size > 0) {
    for (const scenario of Array.from(pending)) {
      const remove = () => pending.splice(pending.indexOf(scenario), 1);
      if (options.stopped()) {
        done.set(scenario.id, { status: "interrupted", ms: 0 });
        remove();
        continue;
      }
      const source = scenario.from ? done.get(scenario.from) : undefined;
      if (scenario.from && source && source.status !== "ok") {
        done.set(scenario.id, {
          status: "blocked",
          error: `${scenario.from} ${source.status}`,
          ms: 0,
        });
        remove();
        continue;
      }
      if (scenario.from && !source) continue;
      if (running.size >= options.jobs) break;
      const busy = [...running.values()].some((r) => conflicts(r.scenario, scenario));
      if (busy || !slotFree(scenario)) continue;
      remove();
      const job = (async () => {
        try {
          done.set(scenario.id, await options.run(scenario));
        } catch (err) {
          done.set(scenario.id, {
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
            ms: 0,
          });
        }
      })();
      running.set(scenario.id, {
        scenario,
        job: job.finally(() => running.delete(scenario.id)),
      });
    }
    if (running.size === 0) {
      for (const scenario of pending.splice(0)) {
        done.set(scenario.id, {
          status: "blocked",
          error: `${scenario.from} never ran`,
          ms: 0,
        });
      }
      break;
    }
    await Promise.race([...running.values()].map((r) => r.job));
  }
  return done;
}

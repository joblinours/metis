import "server-only";

type Target = { mailboxId: string; messageId: string };

function emit(events: Parameters<typeof import("./app-events").emitAppEvent>[0][]): void {
  if (events.length === 0) return;
  void import("./app-events")
    .then(({ emitAppEvent }) => Promise.all(events.map((event) => emitAppEvent(event))))
    .catch((err: unknown) => {
      console.error("[workflow] could not record app events", err);
    });
}

function mailEvent(target: Target) {
  return { hydrate: { kind: "mail", mailboxId: target.mailboxId, id: target.messageId } };
}

export function labelsApplied(targets: Target[], label: string, by: "person" | "ai"): void {
  emit(
    targets.flatMap((target) => [
      {
        kind: "trigger.mail.labelled" as const,
        key: `label:${target.mailboxId}:${target.messageId}:${label}`,
        match: { mailbox: target.mailboxId, label },
        event: mailEvent(target),
      },
      ...(by === "ai"
        ? [
            {
              kind: "trigger.app.aiLabel" as const,
              key: `ai-label:${target.mailboxId}:${target.messageId}:${label}`,
              match: { mailbox: target.mailboxId, label },
              event: { message: mailEvent(target), label },
            },
          ]
        : []),
    ]),
  );
}

export function phishingFound(target: Target, verdict: string, score: number): void {
  emit([
    {
      kind: "trigger.app.phishing",
      key: `phishing:${target.mailboxId}:${target.messageId}`,
      match: { mailbox: target.mailboxId },
      event: { message: mailEvent(target), verdict, score },
    },
  ]);
}

export function memberJoined(opts: {
  workspaceId: string;
  userId: string;
  email: string;
  name: string;
  role: string;
}): void {
  emit([
    {
      kind: "trigger.app.memberJoined",
      key: `member:${opts.workspaceId}:${opts.userId}`,
      workspaceId: opts.workspaceId,
      event: {
        member: { email: opts.email, name: opts.name },
        userId: opts.userId,
        role: opts.role,
        joinedAt: new Date().toISOString(),
      },
    },
  ]);
}

import { CONSOLE_URL } from "@/lib/site";

import { Button } from "./button";

export function StartActions({ night = false }: { night?: boolean }) {
  return (
    <>
      <Button href={CONSOLE_URL} external>
        Get started
      </Button>
      <Button href="/self-host" tone={night ? "night" : "ghost"}>
        Self-host it
      </Button>
    </>
  );
}

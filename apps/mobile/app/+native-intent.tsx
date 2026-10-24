export function redirectSystemPath({ initial }: { path: string; initial: boolean }): string | null {
  return initial ? "/" : null;
}

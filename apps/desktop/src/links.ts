import { SCHEME } from "@metis/shell-core/links";

export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${SCHEME}://`)) ?? null;
}

import Bowser from "bowser";

export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent?.trim()) return "Unknown device";

  let parsed: Bowser.Parser.ParsedResult;
  try {
    parsed = Bowser.parse(userAgent);
  } catch {
    return "Unknown device";
  }

  const { browser, os } = parsed;

  const browserPart = [browser.name, browser.version?.split(".")[0]].filter(Boolean).join(" ");

  if (browserPart && os.name) return `${browserPart} on ${os.name}`;
  return browserPart || os.name || "Unknown device";
}

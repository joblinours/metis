import type { EventConference } from "@/types/calendar";

const SOLUTIONS: [RegExp, string][] = [
  [/(^|\.)meet\.google\.com$/i, "Google Meet"],
  [/(^|\.)zoom\.us$/i, "Zoom"],
  [/(^|\.)teams\.(microsoft|live)\.com$/i, "Microsoft Teams"],
  [/(^|\.)whereby\.com$/i, "Whereby"],
  [/(^|\.)webex\.com$/i, "Webex"],
  [/(^|\.)meeting\.zoho\.[a-z.]+$/i, "Zoho Meeting"],
];

export function conferenceName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  return SOLUTIONS.find(([pattern]) => pattern.test(host))?.[1];
}

export function meetingAddress(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function compactConference(conference: EventConference): EventConference | undefined {
  const phones = conference.phones?.filter((phone) => phone.number);
  const compact: EventConference = {
    ...(conference.name ? { name: conference.name } : {}),
    ...(conference.meetingId ? { meetingId: conference.meetingId } : {}),
    ...(conference.passcode ? { passcode: conference.passcode } : {}),
    ...(phones?.length ? { phones } : {}),
  };
  return Object.keys(compact).length > 0 ? compact : undefined;
}

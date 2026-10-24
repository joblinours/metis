import { Exhibit } from "@/components/exhibit/exhibit";
import type { Pose } from "@/components/exhibit/types";
import { PageJsonLd } from "@/components/json-ld";
import { FeatureArea } from "@/components/site/feature-area";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/calendar");

const POSES: Pose[] = [
  { yaw: -24, pitch: 12, dist: 8.4, target: [0, 1.0, 0.1] },
  { yaw: -4, pitch: 8, dist: 6.6, target: [0, 1.05, 0.3] },
  { yaw: 10, pitch: 10, dist: 6.8, target: [0, 1.05, 0.3] },
  { yaw: -10, pitch: 10, dist: 6.8, target: [0, 1.05, 0.3] },
];

export default function CalendarPage() {
  return (
    <>
      <PageJsonLd path="/calendar" />
      <Exhibit
        model="calendar"
        headline="One calendar for Google Calendar, Outlook, Zoho Calendar and CalDAV"
        poses={POSES}
        plates={[
          {
            label: "Calendar",
            title: (
              <>
                Time, <em>kept in one place.</em>
              </>
            ),
            text: "Every calendar you use in one week, next to the mail and files that go with it.",
          },
          {
            label: "Providers",
            title: (
              <>
                Every calendar, <em>one week.</em>
              </>
            ),
            text: "Google Calendar, Outlook, Zoho Calendar and any CalDAV server, side by side in the same view.",
            chips: [
              { label: "Google Calendar" },
              { label: "Outlook" },
              { label: "Zoho Calendar" },
              { label: "CalDAV" },
            ],
          },
          {
            label: "Find time",
            title: (
              <>
                The free hour, <em>found.</em>
              </>
            ),
            text: "Ask for 45 minutes with Priya next week. The agent reads every calendar and proposes a slot that works for both.",
          },
          {
            label: "Visibility",
            title: (
              <>
                Each workspace sees <em>what you choose.</em>
              </>
            ),
            text: "Pick which calendars a workspace can see. Hidden ones stay out of its views, its agent and its MCP tools.",
          },
        ]}
      />
      <FeatureArea area="calendar" link={false} />
    </>
  );
}

import { Exhibit } from "@/components/exhibit/exhibit";
import type { Pose } from "@/components/exhibit/types";
import { PageJsonLd } from "@/components/json-ld";
import { FeatureArea } from "@/components/site/feature-area";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/mail");

const POSES: Pose[] = [
  { yaw: -16, pitch: 42, dist: 4.9, target: [0, 0.05, 0.1] },
  { yaw: 0, pitch: 50, dist: 11.2, target: [0, 0, 0.3] },
  { yaw: -4, pitch: 14, dist: 6.6, target: [0, 1.08, -0.5] },
  { yaw: 30, pitch: 50, dist: 10.2, target: [0, 0.1, 0] },
];

export default function MailPage() {
  return (
    <>
      <PageJsonLd path="/mail" />
      <Exhibit
        model="envelope"
        headline="AI email client for Gmail, Outlook, Zoho Mail and IMAP, with every inbox in one list"
        poses={POSES}
        plates={[
          {
            label: "Mail",
            title: (
              <>
                Mail, <em>sorted as it lands.</em>
              </>
            ),
            text: "Every mailbox in one list. Turn AI on and each thread arrives labeled, with its point on top. What you do with it stays your call.",
          },
          {
            label: "Providers",
            title: (
              <>
                Every provider, <em>one list.</em>
              </>
            ),
            text: "Gmail, Outlook, Zoho Mail and any IMAP server land in the same list, or open each on its own.",
            chips: [
              { label: "Gmail" },
              { label: "Outlook" },
              { label: "Zoho Mail" },
              { label: "IMAP" },
            ],
          },
          {
            label: "Summaries",
            title: (
              <>
                The point, <em>before you open it.</em>
              </>
            ),
            text: "A two-line summary on every thread, dates and amounts pulled out as actions, and replies drafted in the tone of the message.",
          },
          {
            label: "Labels",
            title: (
              <>
                Sorted <em>on the way in.</em>
              </>
            ),
            text: "Eight labels, so what needs you is never buried under what does not.",
            chips: [
              { label: "Action required", color: "#d1453b" },
              { label: "Work", color: "#3a6fd8" },
              { label: "Transactions", color: "#2f8a57" },
              { label: "Newsletter", color: "#8a857a" },
            ],
          },
        ]}
      />
      <FeatureArea area="mail" link={false} />
    </>
  );
}

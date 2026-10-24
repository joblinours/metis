import { Exhibit } from "@/components/exhibit/exhibit";
import type { Pose } from "@/components/exhibit/types";
import { PageJsonLd } from "@/components/json-ld";
import { FeatureArea } from "@/components/site/feature-area";
import { StartActions } from "@/components/site/start-actions";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/workflows");

const POSES: Pose[] = [
  { yaw: -26, pitch: 34, dist: 9.6, target: [0, 0.3, 0] },
  { yaw: -22, pitch: 30, dist: 6.4, target: [-0.9, 0.3, 0.4] },
  { yaw: 16, pitch: 36, dist: 6.4, target: [0.6, 0.3, -0.35] },
  { yaw: 8, pitch: 22, dist: 5.6, target: [0.9, 0.35, 0.5] },
];

export default function WorkflowsPage() {
  return (
    <>
      <PageJsonLd path="/workflows" />
      <Exhibit
        model="geartrain"
        headline="Email automation workflows with AI decisions and a run history"
        poses={POSES}
        actions={<StartActions />}
        plates={[
          {
            label: "Workflows",
            title: (
              <>
                Mail handled <em>before you open it.</em>
              </>
            ),
            text: "Build a workflow on a canvas, choose when it runs and what it does, and follow every run in a live history.",
          },
          {
            label: "Triggers",
            title: (
              <>
                Starts <em>when you say.</em>
              </>
            ),
            text: "When mail arrives, on a schedule in your time zone, when you press Run now, or just before a message is sent.",
            chips: [
              { label: "When mail arrives" },
              { label: "On a schedule" },
              { label: "Run now" },
              { label: "Before a send" },
            ],
          },
          {
            label: "AI questions",
            title: (
              <>
                A question <em>where a rule is not enough.</em>
              </>
            ),
            text: "Ask the AI about each message, such as “Is this an invoice?” or “How urgent is it?”, and send each answer down its own path.",
          },
          {
            label: "History",
            title: (
              <>
                Every run, <em>written down.</em>
              </>
            ),
            text: "A live history shows each run, the path it took and the messages it handled. Retry only the steps that failed.",
          },
        ]}
      />
      <FeatureArea area="workflows" link={false} />
    </>
  );
}

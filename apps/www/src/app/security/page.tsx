import { Exhibit } from "@/components/exhibit/exhibit";
import type { Pose } from "@/components/exhibit/types";
import { PageJsonLd } from "@/components/json-ld";
import { FeatureArea } from "@/components/site/feature-area";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/security");

const POSES: Pose[] = [
  { yaw: -24, pitch: 12, dist: 11.2, target: [0, 1.15, 0] },
  { yaw: 22, pitch: 10, dist: 12.6, target: [0.2, 1.18, 0.8] },
  { yaw: -12, pitch: 16, dist: 10.6, target: [0, 1.25, 0] },
];

export default function SecurityPage() {
  return (
    <>
      <PageJsonLd path="/security" />
      <Exhibit
        model="padlock"
        headline="Email client security: required two-factor sign-in, encrypted credentials and tracker blocking"
        poses={POSES}
        plates={[
          {
            label: "Security",
            title: (
              <>
                Locked <em>before you ask.</em>
              </>
            ),
            text: "Two-factor sign-in, encrypted credentials and a sandbox for every message, across every tool in the suite.",
          },
          {
            label: "Two factors",
            title: (
              <>
                Two keys, <em>every time.</em>
              </>
            ),
            text: "A password and a code from your authenticator. Nothing past sign-in opens without both.",
          },
          {
            label: "Encrypted",
            title: (
              <>
                Credentials, <em>encrypted at rest.</em>
              </>
            ),
            text: "Every provider token and server login is encrypted in the database, and the instance owner cannot read your mail.",
          },
        ]}
      />
      <FeatureArea area="security" link={false} />
      <FeatureArea area="teams" flip />
    </>
  );
}

import { Exhibit } from "@/components/exhibit/exhibit";
import type { Pose } from "@/components/exhibit/types";
import { PageJsonLd } from "@/components/json-ld";
import { FeatureArea } from "@/components/site/feature-area";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata("/drive");

const POSES: Pose[] = [
  { yaw: -28, pitch: 16, dist: 9.8, target: [0, 0.95, 0.2] },
  { yaw: -6, pitch: 10, dist: 9.2, target: [0, 0.9, 0.6] },
  { yaw: -14, pitch: 26, dist: 9.8, target: [0.1, 1.3, 0.5] },
  { yaw: -6, pitch: 8, dist: 6.6, target: [0.45, 2.05, 1.9] },
];

export default function DrivePage() {
  return (
    <>
      <PageJsonLd path="/drive" />
      <Exhibit
        model="cabinet"
        headline="One file explorer for Google Drive, OneDrive, S3, WebDAV, FTP and SFTP"
        poses={POSES}
        plates={[
          {
            label: "Drive",
            title: (
              <>
                Files, <em>next to the work.</em>
              </>
            ),
            text: "Your drives and file servers in one explorer, next to the mail and calendars they belong with.",
          },
          {
            label: "Sources",
            title: (
              <>
                Every drive, <em>one explorer.</em>
              </>
            ),
            text: "Google Drive and OneDrive come with the account you connect. S3, WebDAV, FTP and SFTP come from servers the instance owner adds.",
            chips: [
              { label: "Google Drive" },
              { label: "OneDrive" },
              { label: "S3" },
              { label: "WebDAV" },
              { label: "FTP" },
              { label: "SFTP" },
            ],
          },
          {
            label: "Attachments",
            title: (
              <>
                From the inbox <em>to the right folder.</em>
              </>
            ),
            text: "Save an attachment straight to any connected drive, or insert a Google Drive or OneDrive link while you write.",
          },
          {
            label: "Preview",
            title: (
              <>
                Open it <em>without downloading.</em>
              </>
            ),
            text: "PDFs, images, CSV tables, text and video open right in the browser.",
          },
        ]}
      />
      <FeatureArea area="drive" link={false} />
    </>
  );
}

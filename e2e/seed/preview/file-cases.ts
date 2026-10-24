import { pdf, png, wav, zip } from "../edge/binary";
import type { FileCase } from "../edge/file-cases";
import { randomBytes } from "../edge/rng";
import { csvRows } from "../edge/text";

const KB = 1024;

const text = (value: string) => () => new TextEncoder().encode(value);

const MARKDOWN = `# Preview fixture

A paragraph with **bold**, _italic_, \`inline code\` and a [link](https://example.com).

## Lists

- one
- two
  - nested
1. first
2. second

## Table

| Column | Value |
| --- | --- |
| alpha | 1 |
| beta | 2 |

> A quote.

\`\`\`ts
export const answer = 42;
\`\`\`
`;

const SHAPES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <rect width="320" height="200" fill="#111110"/>
  <circle cx="100" cy="100" r="60" fill="#c8922a"/>
  <rect x="180" y="50" width="100" height="100" rx="16" fill="#e8e4d8"/>
</svg>
`;

export const PREVIEW_CASES: FileCase[] = [
  {
    key: "preview/image/noise-640x400.png",
    body: () => png(640, 400, "noise", 21),
    contentType: "image/png",
  },
  {
    key: "preview/image/shapes.svg",
    body: text(SHAPES_SVG),
    contentType: "image/svg+xml",
  },
  {
    key: "preview/audio/tone-440hz.wav",
    body: () => wav(2, 440),
    contentType: "audio/wav",
  },
  {
    key: "preview/docs/notes.md",
    body: text(MARKDOWN),
    contentType: "text/markdown",
  },
  {
    key: "preview/docs/three-pages.pdf",
    body: () => pdf(["First page", "Second page with selectable text", "Third page"]),
    contentType: "application/pdf",
  },
  {
    key: "preview/data/people.csv",
    body: text(csvRows(40, ",", 31)),
    contentType: "text/csv",
  },
  {
    key: "preview/data/people.tsv",
    body: text(csvRows(40, "\t", 32)),
    contentType: "text/tab-separated-values",
  },
  {
    key: "preview/archive/bundle.zip",
    body: () =>
      zip({
        "readme.txt": "zip preview",
        "src/index.ts": "export {};\n",
        "assets/logo.png": png(32, 32, "solid"),
      }),
    contentType: "application/zip",
  },
  {
    key: "preview/text/settings.json",
    body: text(`${JSON.stringify({ theme: "dark", retries: 3 }, null, 2)}\n`),
    contentType: "application/json",
  },
  {
    key: "preview/text/Dockerfile",
    body: text('FROM debian:trixie-slim\nCMD ["true"]\n'),
  },
  {
    key: "preview/fallback/slides.pptx",
    body: () => zip({ "[Content_Types].xml": "<Types/>" }),
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  {
    key: "preview/fallback/backup.tar.gz",
    body: () => randomBytes(8 * KB, 41),
    contentType: "application/gzip",
  },
  {
    key: "preview/fallback/blob.dat",
    body: () => randomBytes(16 * KB, 42),
    contentType: "application/octet-stream",
  },
];

import { pdf, png, truncate, wav, zip } from "./binary";
import { randomBytes, words } from "./rng";
import { csvRows, logLines, markdownPages } from "./text";

const KB = 1024;
const MB = 1024 * KB;

export interface FileCase {
  key: string;
  body: () => Uint8Array;
  contentType?: string;
}

const text = (value: string) => () => new TextEncoder().encode(value);
const built = (build: () => string) => () => new TextEncoder().encode(build());

const EVIL_MARKDOWN = `# Hostile markdown

<script>document.title = "markdown script ran"</script>

<img src="x" onerror="document.title = 'markdown onerror ran'">

<iframe src="https://example.com"></iframe>

[javascript link](javascript:document.title='markdown link ran')

<a href="https://example.com" onclick="document.title='markdown onclick ran'">onclick link</a>

<style>body { display: none }</style>
`;

const EVIL_HTML = `<!doctype html>
<html>
<body>
<script>document.title = "html script ran"; fetch("/api/auth/get-session")</script>
<img src="x" onerror="document.title = 'html onerror ran'">
<p>If this renders as a page, preview is broken.</p>
</body>
</html>
`;

const EVIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" onload="document.title='svg onload ran'">
  <script>document.title = "svg script ran"</script>
  <rect width="240" height="120" fill="#c8922a"/>
  <image href="https://example.com/tracker.png" width="10" height="10"/>
  <text x="20" y="66" font-size="18" fill="#111110">hostile svg</text>
</svg>
`;

export const FILE_CASES: FileCase[] = [
  {
    key: "edge/empty.txt",
    body: () => new Uint8Array(0),
    contentType: "text/plain",
  },
  { key: "edge/one-byte", body: () => new Uint8Array([0x78]) },
  {
    key: `edge/${"k".repeat(1024 - "edge/".length)}`,
    body: text("key at the 1024 byte S3 limit"),
  },
  {
    key: "edge/unicode/\u{65E5}\u{672C}\u{8A9E} \u{30D5}\u{30A1}\u{30A4}\u{30EB} \u{1F389}.txt",
    body: text("unicode key"),
  },
  { key: "edge/unicode/\u{202E}txt.exe", body: text("rtl override key") },
  { key: "edge/unicode/caf\u{E9}.txt", body: text("NFC caf\u{E9}") },
  { key: "edge/unicode/cafe\u{301}.txt", body: text("NFD caf\u{E9}") },
  {
    key: "edge/special/a b#c?d%e+f&g=h;i,j@k$l!m'(n)[o]{p}~.txt",
    body: text("special characters in key"),
  },
  { key: "edge/special/trailing-dot.", body: text("trailing dot") },
  { key: "edge/special/.hidden", body: text("dotfile") },
  { key: "edge/special/no-extension", body: text("no extension") },
  { key: "edge/special/invoice.pdf.exe", body: text("double extension") },
  { key: "edge/case/Report.txt", body: text("uppercase R") },
  { key: "edge/case/report.txt", body: text("lowercase r") },
  { key: "edge/folder-marker/", body: () => new Uint8Array(0) },
  { key: "edge/empty-folder/", body: () => new Uint8Array(0) },
  {
    key: `edge/deep/${Array.from({ length: 40 }, (_, i) => `d${i}`).join("/")}/bottom.txt`,
    body: text("40 levels deep"),
  },
  {
    key: "edge/mislabeled/photo.jpg",
    body: () => pdf(["not a photo"]),
    contentType: "image/jpeg",
  },
  {
    key: "edge/mislabeled/archive.pdf",
    body: () => zip({ "a.txt": "zip, not pdf" }),
    contentType: "application/pdf",
  },
  {
    key: "edge/no-content-type.bin",
    body: () => randomBytes(4 * KB, 1),
    contentType: "",
  },
  {
    key: "edge/images/1x1.png",
    body: () => png(1, 1, "solid"),
    contentType: "image/png",
  },
  {
    key: "edge/images/bomb-10000x10000.png",
    body: () => png(10_000, 10_000, "solid"),
    contentType: "image/png",
  },
  {
    key: "edge/images/noise-3000x2500.png",
    body: () => png(3000, 2500, "noise", 9),
    contentType: "image/png",
  },
  {
    key: "edge/images/truncated.png",
    body: () => truncate(png(800, 600, "noise", 10), 0.5),
    contentType: "image/png",
  },
  {
    key: "edge/docs/2000-pages.pdf",
    body: () => pdf(Array.from({ length: 2000 }, (_, i) => `Page ${i + 1} ${words(20, i)}`)),
    contentType: "application/pdf",
  },
  {
    key: "edge/docs/corrupt.pdf",
    body: () => truncate(pdf(["corrupt"]), 0.3),
    contentType: "application/pdf",
  },
  {
    key: "edge/big/random-64mb.bin",
    body: () => randomBytes(64 * MB, 64),
    contentType: "application/octet-stream",
  },
  {
    key: "edge/preview/tables/rows-100000.csv",
    body: built(() => csvRows(100_000, ",", 33)),
    contentType: "text/csv",
  },
  {
    key: "edge/preview/tables/rows-150000.csv",
    body: built(() => csvRows(150_000, ",", 34)),
    contentType: "text/csv",
  },
  {
    key: "edge/preview/tables/rows-500000-over-cap.csv",
    body: built(() => csvRows(500_000, ",", 35)),
    contentType: "text/csv",
  },
  {
    key: "edge/preview/tables/ragged.csv",
    body: text("a,b,c\n1,2\n3,4,5,6,7\n\n8\n9,10,11\n"),
    contentType: "text/csv",
  },
  {
    key: "edge/preview/tables/bom.csv",
    body: built(() => `\u{FEFF}${csvRows(20, ",", 36)}`),
    contentType: "text/csv",
  },
  {
    key: "edge/preview/tables/latin1.csv",
    body: () => Buffer.from("name,city\nJos\u{E9},S\u{E3}o Paulo\nZo\u{EB},K\u{F6}ln\n", "latin1"),
    contentType: "text/csv",
  },
  {
    key: "edge/preview/tables/empty.csv",
    body: () => new Uint8Array(0),
    contentType: "text/csv",
  },
  {
    key: "edge/preview/tables/formulas.csv",
    body: text("name,value\n=cmd|' /C calc'!A0,1\n<script>alert(1)</script>,2\n+SUM(1;2),3\n"),
    contentType: "text/csv",
  },
  {
    key: "edge/preview/text/server-3mb.log",
    body: built(() => logLines(3 * MB)),
    contentType: "text/plain",
  },
  {
    key: "edge/preview/text/split-utf8.txt",
    body: built(() => `${"a".repeat(2 * MB - 1)}${"\u{20AC}".repeat(64)}`),
    contentType: "text/plain",
  },
  {
    key: "edge/preview/text/nul-bytes.txt",
    body: () =>
      Buffer.concat([
        Buffer.from("looks like text\n"),
        Buffer.alloc(4 * KB),
        Buffer.from("\nbut is not\n"),
      ]),
    contentType: "text/plain",
  },
  {
    key: "edge/preview/text/long-over-cap.md",
    body: built(() => markdownPages(2.5 * MB)),
    contentType: "text/markdown",
  },
  {
    key: "edge/preview/images/noise-26mb-over-cap.png",
    body: () => png(3200, 2800, "noise", 43),
    contentType: "image/png",
  },
  {
    key: "edge/preview/docs/encrypted.pdf",
    body: () => pdf(["Password protected page"], { password: "metis" }),
    contentType: "application/pdf",
  },
  {
    key: "edge/preview/docs/padded-51mb-over-cap.pdf",
    body: () => pdf(["Padded page"], { padding: 51 * MB }),
    contentType: "application/pdf",
  },
  {
    key: "edge/preview/archives/empty.zip",
    body: () => zip({}),
    contentType: "application/zip",
  },
  {
    key: "edge/preview/archives/50000-entries.zip",
    body: () =>
      zip(
        Object.fromEntries(
          Array.from({ length: 50_000 }, (_, i) => [
            `entries/${String(Math.floor(i / 1000)).padStart(2, "0")}/file-${String(i).padStart(5, "0")}.txt`,
            `entry ${i}`,
          ]),
        ),
        0,
      ),
    contentType: "application/zip",
  },
  {
    key: "edge/preview/archives/stored-101mb-over-cap.zip",
    body: () => zip({ "large.bin": randomBytes(101 * MB, 71) }, 0),
    contentType: "application/zip",
  },
  {
    key: "edge/preview/audio/broken-header.wav",
    body: () => {
      const broken = wav(1, 440);
      broken.write("JUNK", 8, "ascii");
      return broken;
    },
    contentType: "audio/wav",
  },
  {
    key: "edge/preview/audio/tone-201mb-over-cap.wav",
    body: () => wav(4800, 220),
    contentType: "audio/wav",
  },
  {
    key: "edge/preview/hostile/evil.svg",
    body: text(EVIL_SVG),
    contentType: "image/svg+xml",
  },
  {
    key: "edge/preview/hostile/evil.html",
    body: text(EVIL_HTML),
    contentType: "text/html",
  },
  {
    key: "edge/preview/hostile/evil.md",
    body: text(EVIL_MARKDOWN),
    contentType: "text/markdown",
  },
  {
    key: "edge/preview/hostile/script.pdf",
    body: () =>
      pdf(["This PDF carries an OpenAction script"], {
        script: "app.alert('pdf script ran')",
      }),
    contentType: "application/pdf",
  },
  {
    key: "edge/preview/hostile/fake.png",
    body: text(EVIL_HTML),
    contentType: "image/png",
  },
  {
    key: "edge/preview/hostile/traversal.zip",
    body: () =>
      zip({
        "../../outside.txt": "path traversal",
        "/absolute.txt": "absolute path",
        "<img src=x onerror=alert(1)>.txt": "markup in a name",
      }),
    contentType: "application/zip",
  },
];

export const FILE_BULK_PREFIX = "edge/bulk-2500/";
export const FILE_BULK_COUNT = 2500;

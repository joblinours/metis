import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const MTB_REPO = "apparition47/MailTrackerBlocker";
const MTB_COMMIT = "7463682a39af055a488539a3d0aa7898437b33f5";
const MTB_FILE = "Source/MTBBlockedMessage.m";
const MTB_URL = `https://raw.githubusercontent.com/${MTB_REPO}/${MTB_COMMIT}/${MTB_FILE}`;
const MTB_VENDOR_FLOOR = 250;

const CLEARURLS_DATA_URL = "https://rules2.clearurls.xyz/data.minify.json";
const CLEARURLS_HASH_URL = "https://rules2.clearurls.xyz/rules.minify.hash";
const CLEARURLS_LICENSE_URL = "https://raw.githubusercontent.com/ClearURLs/Rules/master/LICENSE";
const CLEARURLS_PROVIDER_FLOOR = 150;

const root = process.cwd();
const renderDir = path.join(root, "src", "mail", "render");

async function download(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

function compile(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function unescapeObjC(raw: string): string {
  return raw.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}

function trackerDictBody(source: string): string {
  const start = source.indexOf("getTrackerDict");
  if (start < 0) throw new Error("getTrackerDict not found upstream");
  const open = source.indexOf("@{", start);
  if (open < 0) throw new Error("getTrackerDict has no dictionary literal");
  let depth = 0;
  let inString = false;
  for (let i = open + 1; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "/" && source[i + 1] === "/") {
      const eol = source.indexOf("\n", i);
      i = eol < 0 ? source.length : eol;
    } else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 2, i);
    }
  }
  throw new Error("getTrackerDict dictionary is not closed");
}

type Token = { kind: "string"; value: string } | { kind: "punct"; value: string };

function tokenize(body: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i] ?? "";
    if (/\s/.test(c)) continue;
    if (c === "/" && body[i + 1] === "/") {
      const eol = body.indexOf("\n", i);
      i = eol < 0 ? body.length : eol;
      continue;
    }
    if (c === "@" && body[i + 1] === '"') {
      let j = i + 2;
      let raw = "";
      while (j < body.length && body[j] !== '"') {
        if (body[j] === "\\") {
          raw += body.slice(j, j + 2);
          j += 2;
        } else {
          raw += body[j];
          j++;
        }
      }
      tokens.push({ kind: "string", value: unescapeObjC(raw) });
      i = j;
      continue;
    }
    if (c === "@" && body[i + 1] === "[") {
      tokens.push({ kind: "punct", value: "[" });
      i++;
      continue;
    }
    tokens.push({ kind: "punct", value: c });
  }
  return tokens;
}

function parseTrackers(source: string): [string, string[]][] {
  const tokens = tokenize(trackerDictBody(source));
  const vendors: [string, string[]][] = [];
  let i = 0;
  const expect = (value: string) => {
    const t = tokens[i++];
    if (t?.kind !== "punct" || t.value !== value) {
      throw new Error(`expected "${value}" at token ${i - 1}`);
    }
  };
  while (i < tokens.length) {
    const key = tokens[i++];
    if (key?.kind !== "string") throw new Error(`expected a vendor at ${i - 1}`);
    expect(":");
    expect("[");
    const patterns: string[] = [];
    for (let t = tokens[i]; t?.kind === "string"; t = tokens[i]) {
      patterns.push(t.value);
      i++;
      if (tokens[i]?.kind === "punct" && tokens[i]?.value === ",") i++;
    }
    expect("]");
    if (tokens[i]?.kind === "punct" && tokens[i]?.value === ",") i++;
    const valid = patterns.filter((pattern) => compile(pattern) !== null);
    const dropped = patterns.length - valid.length;
    if (dropped > 0) {
      console.warn(
        `[privacy-rules] ${key.value}: dropped ${dropped} pattern(s) that do not compile as JavaScript`,
      );
    }
    if (valid.length > 0) vendors.push([key.value, valid]);
  }
  return vendors.toSorted(([a], [b]) => a.localeCompare(b));
}

const upstreamProviderSchema = z.object({
  urlPattern: z.string().optional(),
  completeProvider: z.boolean().optional(),
  rules: z.array(z.string()).optional(),
  rawRules: z.array(z.string()).optional(),
  referralMarketing: z.array(z.string()).optional(),
  exceptions: z.array(z.string()).optional(),
  redirections: z.array(z.string()).optional(),
});
type UpstreamProvider = z.infer<typeof upstreamProviderSchema>;

function cleanProvider(name: string, p: UpstreamProvider) {
  if (!p.urlPattern || compile(p.urlPattern) === null) {
    console.warn(`[privacy-rules] ${name}: urlPattern does not compile`);
    return null;
  }
  const list = (values: string[] | undefined, field: string) => {
    const valid = (values ?? []).filter((v) =>
      field === "rules" || field === "referralMarketing"
        ? compile(`^${v}$`) !== null
        : compile(v) !== null,
    );
    if ((values?.length ?? 0) !== valid.length) {
      console.warn(
        `[privacy-rules] ${name}: dropped ${(values?.length ?? 0) - valid.length} ${field} entr(ies) that do not compile`,
      );
    }
    return valid;
  };
  return {
    name,
    urlPattern: p.urlPattern,
    completeProvider: p.completeProvider === true,
    rules: list(p.rules, "rules"),
    rawRules: list(p.rawRules, "rawRules"),
    referralMarketing: list(p.referralMarketing, "referralMarketing"),
    exceptions: list(p.exceptions, "exceptions"),
    redirections: list(p.redirections, "redirections"),
  };
}

function writeModule(file: string, source: string) {
  return fs.writeFile(path.join(renderDir, file), source);
}

console.log(`[privacy-rules] fetching ${MTB_REPO}@${MTB_COMMIT.slice(0, 7)}…`);
const trackers = parseTrackers(await download(MTB_URL));
if (trackers.length < MTB_VENDOR_FLOOR) {
  throw new Error(
    `only ${trackers.length} tracker vendors parsed (floor ${MTB_VENDOR_FLOOR}); the upstream format probably changed`,
  );
}

console.log("[privacy-rules] fetching ClearURLs rules…");
const [data, hashFile, license] = await Promise.all([
  download(CLEARURLS_DATA_URL),
  download(CLEARURLS_HASH_URL),
  download(CLEARURLS_LICENSE_URL),
]);
if (!/GNU LESSER GENERAL PUBLIC LICENSE/.test(license)) {
  throw new Error("the ClearURLs rules are no longer published under the LGPL");
}
const expected = hashFile.trim().split(/\s+/)[0]?.toLowerCase();
const actual = createHash("sha256").update(data).digest("hex");
if (expected !== actual) {
  throw new Error(`ClearURLs data hash mismatch: expected ${expected}, got ${actual}`);
}
const upstream = z
  .object({ providers: z.record(z.string(), upstreamProviderSchema) })
  .parse(JSON.parse(data));
const providers = Object.entries(upstream.providers)
  .map(([name, p]) => cleanProvider(name, p))
  .filter((p) => p !== null);
if (providers.length < CLEARURLS_PROVIDER_FLOOR) {
  throw new Error(
    `only ${providers.length} ClearURLs providers parsed (floor ${CLEARURLS_PROVIDER_FLOOR}); the upstream format probably changed`,
  );
}

await writeModule(
  "trackers.ts",
  [
    `import type { TrackerVendor } from "./types";`,
    ``,
    `export const TRACKER_SOURCE = ${JSON.stringify({ repository: `https://github.com/${MTB_REPO}`, commit: MTB_COMMIT, file: MTB_FILE })};`,
    ``,
    `export const TRACKER_VENDORS: readonly TrackerVendor[] = ${JSON.stringify(
      trackers.map(([vendor, patterns]) => ({ vendor, patterns })),
    )};`,
    ``,
  ].join("\n"),
);

await writeModule(
  "clearurls.ts",
  [
    `import type { ClearUrlsProvider } from "./types";`,
    ``,
    `export const CLEARURLS_SOURCE = ${JSON.stringify({ url: CLEARURLS_DATA_URL, sha256: actual })};`,
    ``,
    `export const CLEARURLS_PROVIDERS: readonly ClearUrlsProvider[] = ${JSON.stringify(providers)};`,
    ``,
  ].join("\n"),
);

await writeModule("clearurls.LICENSE", license);

execSync(
  `bunx oxfmt ${path.join(renderDir, "trackers.ts")} ${path.join(renderDir, "clearurls.ts")}`,
  { cwd: root, stdio: "ignore" },
);

console.log(
  `[privacy-rules] wrote ${trackers.length} tracker vendors and ${providers.length} ClearURLs providers`,
);

import { readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "THIRD_PARTY_LICENSES.txt");
const WORKSPACE_SCOPE = "@metis/";

const LICENSE_FILES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "COPYING",
  "COPYING.md",
  "NOTICE",
];

interface Manifest {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: { type?: string }[];
  repository?: string | { url?: string };
  dependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest | null {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function resolvePackage(name: string, from: string): string | null {
  let current = from;
  for (;;) {
    const candidate = join(current, "node_modules", name);
    if (readManifest(candidate)) return realpathSync(candidate);
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function licenseName(manifest: Manifest): string {
  if (typeof manifest.license === "string") return manifest.license;
  if (manifest.license?.type) return manifest.license.type;
  const legacy = manifest.licenses?.[0]?.type;
  return legacy ?? "UNKNOWN";
}

function repositoryUrl(manifest: Manifest): string {
  const repo = manifest.repository;
  const url = typeof repo === "string" ? repo : repo?.url;
  return (url ?? "").replace(/^git\+/, "").replace(/\.git$/, "");
}

function licenseText(dir: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const candidate of LICENSE_FILES) {
    const match = entries.find((entry) => entry.toLowerCase() === candidate.toLowerCase());
    if (!match) continue;
    try {
      const text = readFileSync(join(dir, match), "utf8").trim();
      if (text.length > 0) return text;
    } catch {}
  }
  return null;
}

const root = readManifest(ROOT);
if (!root) {
  console.error(`[licenses] no package.json in ${ROOT}`);
  process.exit(1);
}

const seen = new Map<string, { dir: string; manifest: Manifest }>();
const workspaces = new Set<string>();
const missing: string[] = [];
const queue: { name: string; from: string }[] = Object.keys(root.dependencies ?? {}).map(
  (name) => ({ name, from: ROOT }),
);

while (queue.length > 0) {
  // oxlint-disable-next-line typescript/no-non-null-assertion --bounded by the loop guard
  const { name, from } = queue.shift()!;
  const dir = resolvePackage(name, from);
  if (!dir) {
    if (!missing.includes(name)) missing.push(name);
    continue;
  }
  const manifest = readManifest(dir);
  if (!manifest) continue;
  const key = `${manifest.name ?? name}@${manifest.version ?? "0.0.0"}`;
  if (seen.has(key) || workspaces.has(key)) continue;
  if (manifest.name?.startsWith(WORKSPACE_SCOPE)) workspaces.add(key);
  else seen.set(key, { dir, manifest });
  for (const child of Object.keys(manifest.dependencies ?? {})) {
    queue.push({ name: child, from: dir });
  }
}

const sorted = [...seen.entries()].toSorted(([a], [b]) => a.localeCompare(b));
const withoutText: string[] = [];

const sections = sorted.map(([key, { dir, manifest }]) => {
  const text = licenseText(dir);
  if (!text) withoutText.push(key);
  const repo = repositoryUrl(manifest);
  return [
    "-".repeat(78),
    `${key}  (${licenseName(manifest)})`,
    repo ? repo : null,
    "-".repeat(78),
    "",
    text ??
      `No license file was shipped with this package. Declared license: ${licenseName(manifest)}.`,
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
});

const header =
  `Third party licenses for ${root.name ?? "this product"} ${root.version ?? ""}`.trim();

writeFileSync(
  OUT,
  `${header}

This file lists every third-party package included in the production
dependency tree of this build, with the license text shipped by each one.
These terms apply to those packages only and are not affected by the license
of this product itself, which is in LICENSE.

Source code copied into this repository rather than installed as a dependency
is attributed in NOTICE.

Packages: ${sorted.length}
Generated: ${new Date().toISOString()}

${sections.join("\n")}`,
  "utf8",
);

console.log(`[licenses] wrote ${OUT} — ${sorted.length} packages`);
if (withoutText.length > 0) {
  console.log(
    `[licenses] ${withoutText.length} shipped no license file: ${withoutText.slice(0, 10).join(", ")}${withoutText.length > 10 ? ", …" : ""}`,
  );
}
if (missing.length > 0) {
  console.log(
    `[licenses] ${missing.length} not installed (optional or platform-specific): ${missing.join(", ")}`,
  );
}

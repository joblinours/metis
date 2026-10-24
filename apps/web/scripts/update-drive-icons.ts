import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const REPO = "https://github.com/catppuccin/vscode-icons.git";
const FLAVORS = ["mocha", "latte"] as const;

const BASE_ICONS = ["_file", "_folder", "_folder_open"];

const FILE_ICONS = [
  "3d",
  "adobe-ae",
  "adobe-ai",
  "adobe-id",
  "adobe-ps",
  "adobe-xd",
  "android",
  "apple",
  "asciidoc",
  "audio",
  "bash",
  "batch",
  "binary",
  "c",
  "certificate",
  "changelog",
  "config",
  "cpp",
  "csharp",
  "css",
  "csv",
  "dart",
  "database",
  "docker",
  "drawio",
  "exe",
  "favicon",
  "figma",
  "font",
  "git",
  "go",
  "html",
  "image",
  "java",
  "javascript",
  "javascript-react",
  "json",
  "jupyter",
  "key",
  "kotlin",
  "latex",
  "license",
  "log",
  "lua",
  "macos",
  "markdown",
  "markdown-mdx",
  "midi",
  "ms-excel",
  "ms-powerpoint",
  "ms-word",
  "org",
  "pdf",
  "php",
  "powershell",
  "properties",
  "python",
  "r",
  "readme",
  "ruby",
  "sketch",
  "svg",
  "swift",
  "text",
  "todo",
  "toml",
  "typescript",
  "typescript-react",
  "url",
  "video",
  "xml",
  "yaml",
  "zip",
];

const FOLDER_ICONS = [
  "folder_assets",
  "folder_audio",
  "folder_cloud",
  "folder_content",
  "folder_docs",
  "folder_download",
  "folder_fonts",
  "folder_images",
  "folder_private",
  "folder_public",
  "folder_scripts",
  "folder_security",
  "folder_shared",
  "folder_svg",
  "folder_temp",
  "folder_templates",
  "folder_upload",
  "folder_video",
];

const root = process.cwd();
const clone = path.join(os.tmpdir(), `metis-drive-icons-${Date.now()}`);
const publicDir = path.join(root, "public", "drive-icons");

function invert(source: Record<string, string>, keep: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, icon] of Object.entries(source)) {
    if (keep.has(icon)) out[key] = icon;
  }
  return out;
}

function serialize(name: string, value: Record<string, string>): string {
  const body = Object.entries(value)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([key, icon]) => `  ${JSON.stringify(key)}: ${JSON.stringify(icon)},`)
    .join("\n");
  return `export const ${name}: Record<string, DriveIconName> = {\n${body}\n};`;
}

try {
  console.log("[drive-icons] cloning catppuccin/vscode-icons…");
  execSync(`git clone --depth=1 --single-branch --branch=main ${REPO} ${clone}`, {
    stdio: "ignore",
  });

  const icons = [
    ...BASE_ICONS,
    ...FILE_ICONS,
    ...FOLDER_ICONS.flatMap((name) => [name, `${name}_open`]),
  ].toSorted();

  const wanted = FLAVORS.flatMap((flavor) => icons.map((icon) => `${flavor}/${icon}.svg`));
  const present = await Promise.all(
    wanted.map((name) =>
      fs
        .access(path.join(clone, "icons", name))
        .then(() => true)
        .catch(() => false),
    ),
  );
  const missing = wanted.filter((_, i) => !present[i]);
  if (missing.length > 0) {
    throw new Error(`upstream no longer ships ${missing.length} icon(s): ${missing.join(", ")}`);
  }

  await fs.rm(publicDir, { recursive: true, force: true });
  await Promise.all(
    FLAVORS.map(async (flavor) => {
      const out = path.join(publicDir, flavor);
      await fs.mkdir(out, { recursive: true });
      await Promise.all(
        icons.map((icon) =>
          fs.copyFile(
            path.join(clone, "icons", flavor, `${icon}.svg`),
            path.join(out, `${icon}.svg`),
          ),
        ),
      );
    }),
  );
  console.log(`[drive-icons] wrote ${icons.length} icons × ${FLAVORS.length} flavors`);

  const fileModule = await import(path.join(clone, "src", "defaults", "fileIcons.ts"));
  const folderModule = await import(path.join(clone, "src", "defaults", "folderIcons.ts"));

  const keep = new Set(icons);
  const names = invert(fileModule.fileNames, keep);
  const extensions = invert(fileModule.fileExtensions, keep);
  const folders = invert(folderModule.folderNames, keep);

  const source = [
    `export const DRIVE_ICON_NAMES = [`,
    ...icons.map((icon) => `  ${JSON.stringify(icon)},`),
    `] as const;`,
    ``,
    `export type DriveIconName = (typeof DRIVE_ICON_NAMES)[number];`,
    ``,
    serialize("FILE_NAME_ICONS", names),
    ``,
    serialize("FILE_EXTENSION_ICONS", extensions),
    ``,
    serialize("FOLDER_NAME_ICONS", folders),
    ``,
  ].join("\n");

  await fs.writeFile(path.join(root, "src", "drive", "icons.ts"), source);
  console.log(
    `[drive-icons] mapped ${Object.keys(names).length} names, ${Object.keys(extensions).length} extensions, ${Object.keys(folders).length} folders`,
  );
} finally {
  await fs.rm(clone, { recursive: true, force: true });
}

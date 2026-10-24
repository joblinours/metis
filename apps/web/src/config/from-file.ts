import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";

const DEFAULT_LOCATIONS = [
  "metis.config.yaml",
  "metis.config.yml",
  "metis.config.json",
  "metis.config.toml",
  "/etc/metis/config.yaml",
  "/etc/metis/config.yml",
  "/etc/metis/config.json",
  "/etc/metis/config.toml",
];

function parseByExtension(path: string, contents: string): unknown {
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return parseYaml(contents);
  if (path.endsWith(".json")) return JSON.parse(contents);
  if (path.endsWith(".toml")) return parseToml(contents);
  throw new Error(
    `Unrecognized config file extension: ${path} (expected .yaml, .yml, .json or .toml)`,
  );
}

function resolvePath(): string | undefined {
  const explicit = process.env.METIS_CONFIG_PATH;
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new Error(`METIS_CONFIG_PATH is set to "${explicit}" but that file does not exist`);
    }
    return explicit;
  }

  for (const candidate of DEFAULT_LOCATIONS) {
    const path = candidate.startsWith("/")
      ? candidate
      : join(/* turbopackIgnore: true */ process.cwd(), candidate);
    if (existsSync(path)) return path;
  }

  return undefined;
}

export function loadConfigFile(): unknown {
  const path = resolvePath();
  if (!path) return undefined;
  return parseByExtension(path, readFileSync(/* turbopackIgnore: true */ path, "utf8"));
}

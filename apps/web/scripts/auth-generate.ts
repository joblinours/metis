import { spawnSync } from "node:child_process";
import { existsSync, symlinkSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ALIAS = resolve(ROOT, "node_modules/@");

const aliasExisted = existsSync(ALIAS);

try {
  if (!aliasExisted) symlinkSync("../src", ALIAS);

  const result = spawnSync(
    "bunx",
    [
      "auth@latest",
      "generate",
      "--config",
      "src/auth/generate.ts",
      "--output",
      "src/db/auth-schema.ts",
      "--yes",
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} finally {
  if (!aliasExisted && existsSync(ALIAS)) unlinkSync(ALIAS);
}

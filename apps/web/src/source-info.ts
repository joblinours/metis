import "server-only";
import { config } from "@/config";

import pkg from "../package.json";

export interface SourceInfo {
  url: string;
  version: string;
}

export function sourceInfo(): SourceInfo {
  return { url: config.app.sourceUrl, version: pkg.version };
}

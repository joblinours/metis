"use client";

import type { SystemDriver } from "@/server/schema";

import { CacheView } from "./cache-view";
import { DatabaseView } from "./database-view";
import { LlmView } from "./llm-view";
import { MailView } from "./mail-view";
import { PhishingView } from "./phishing-view";
import { RunnerView } from "./runner-view";

const DRIVER_VIEWS: Record<SystemDriver, () => React.ReactNode> = {
  llm: LlmView,
  phishing: PhishingView,
  mail: MailView,
  cache: CacheView,
  runner: RunnerView,
  database: DatabaseView,
};

export function DriverView({ driver }: { driver: SystemDriver }) {
  const View = DRIVER_VIEWS[driver];
  return <View />;
}

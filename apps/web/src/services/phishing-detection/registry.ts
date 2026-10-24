import "server-only";
import { sectionCached } from "@/config/runtime";
import type { PhishingDetectionConfig } from "@/config/schema";

import { createDisabledDriver } from "./drivers/disabled";
import { createMetisDriver } from "./drivers/metis";
import type { PhishingDetectionDriver } from "./types";

function buildDriver(cfg: PhishingDetectionConfig): PhishingDetectionDriver {
  switch (cfg.driver) {
    case "metis":
      return createMetisDriver(cfg);
    case "disabled":
      return createDisabledDriver();
  }
}

export const getPhishingDetection: () => PhishingDetectionDriver = sectionCached(
  ["phishingDetection"],
  (cfg) => buildDriver(cfg.phishingDetection),
);

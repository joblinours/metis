import "server-only";
import type { PhishingDetectionDriver } from "../types";

export function createDisabledDriver(): PhishingDetectionDriver {
  return {
    analyze() {
      throw new Error(
        "Phishing detection is disabled (METIS_PHISHING_DETECTION_DRIVER=disabled) — this call should have been gated before reaching the driver",
      );
    },
  };
}

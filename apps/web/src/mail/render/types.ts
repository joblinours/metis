export interface TrackerVendor {
  vendor: string;
  patterns: readonly string[];
}

export interface ClearUrlsProvider {
  name: string;
  urlPattern: string;
  completeProvider: boolean;
  rules: readonly string[];
  rawRules: readonly string[];
  referralMarketing: readonly string[];
  exceptions: readonly string[];
  redirections: readonly string[];
}

export type TrackerKind = "pixel" | "image" | "css";

export interface TrackerHit {
  vendor: string | null;
  kind: TrackerKind;
}

export type RemoteImages = "block" | "load" | "proxy";

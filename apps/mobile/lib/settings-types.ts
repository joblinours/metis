export interface Settings {
  restoreLastPage: boolean;
  textZoom: number;
  checkForUpdates: boolean;
  announcedVersion: string | null;
}

export type OfflineReason = "offline" | "unreachable";

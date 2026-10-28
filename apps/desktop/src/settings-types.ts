export type DownloadMode = "ask" | "folder";

export interface Settings {
  openAtLogin: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  restoreLastPage: boolean;
  checkForUpdates: boolean;
  announcedVersion: string | null;
  downloadMode: DownloadMode;
  downloadFolder: string | null;
  downloadNotify: boolean;
  lastDownloadFolder: string | null;
  hardwareAcceleration: boolean;
  zoomFactor: number;
}

export type SettingsSection = "general" | "server" | "downloads" | "advanced" | "about";

export type UpdateInfo =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "current"; checkedAt: number }
  | { state: "available"; version: string; checkedAt: number }
  | { state: "failed"; checkedAt: number };

export interface SettingsPayload {
  settings: Settings;
  platform: string;
  server: string | null;
  restartRequired: boolean;
  defaultDownloadFolder: string;
  logFile: string;
  update: UpdateInfo;
  about: {
    version: string;
    electron: string;
    chrome: string;
  };
}

export type OfflineReason = "offline" | "unreachable";

export interface MetisBridge {
  info(): Promise<{ server: string | null } | null>;
  setServer(url: string): Promise<{ ok: boolean; error?: string }>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  changeServer(): Promise<void>;
  retryConnection(): Promise<{ ok: boolean; reason?: OfflineReason }>;
  reopen(): Promise<void>;
  openSettings(): Promise<void>;
  getSettings(): Promise<SettingsPayload | null>;
  updateSettings(patch: Partial<Settings>): Promise<SettingsPayload | null>;
  chooseDownloadFolder(): Promise<SettingsPayload | null>;
  checkForUpdates(): Promise<SettingsPayload | null>;
  downloadUpdate(): Promise<void>;
  clearCache(): Promise<boolean>;
  showLog(): Promise<void>;
  resetApp(): Promise<boolean>;
  restart(): Promise<void>;
}

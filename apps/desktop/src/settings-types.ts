export type DownloadMode = "ask" | "folder";

export interface Settings {
  openAtLogin: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  restoreLastPage: boolean;
  downloadMode: DownloadMode;
  downloadFolder: string | null;
  downloadNotify: boolean;
  lastDownloadFolder: string | null;
  spellcheck: boolean;
  spellcheckLanguages: string[];
  hardwareAcceleration: boolean;
  zoomFactor: number;
}

export interface SettingsPayload {
  settings: Settings;
  platform: string;
  server: string | null;
  spellcheckLanguages: string[];
  restartRequired: boolean;
  defaultDownloadFolder: string;
  logFile: string;
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
  openSettings(): Promise<void>;
  getSettings(): Promise<SettingsPayload | null>;
  updateSettings(patch: Partial<Settings>): Promise<SettingsPayload | null>;
  chooseDownloadFolder(): Promise<SettingsPayload | null>;
  clearCache(): Promise<boolean>;
  showLog(): Promise<void>;
  resetApp(): Promise<boolean>;
  restart(): Promise<void>;
}

import { contextBridge, ipcRenderer } from "electron";

import type { MetisBridge, Settings } from "./settings-types";

const HISTORY_BUTTONS: Record<number, "back" | "forward"> = { 3: "back", 4: "forward" };

window.addEventListener("online", () => ipcRenderer.send("metis:network", true));
window.addEventListener("offline", () => ipcRenderer.send("metis:network", false));
window.addEventListener("mouseup", (event) => {
  const direction = HISTORY_BUTTONS[event.button];
  if (direction) ipcRenderer.send("metis:history", direction);
});

if (location.protocol === "file:") {
  contextBridge.exposeInMainWorld("metis", {
    info: () => ipcRenderer.invoke("metis:info"),
    setServer: (url: string) => ipcRenderer.invoke("metis:set-server", url),
    signIn: () => ipcRenderer.invoke("metis:sign-in"),
    signOut: () => ipcRenderer.invoke("metis:sign-out"),
    changeServer: () => ipcRenderer.invoke("metis:change-server"),
    retryConnection: () => ipcRenderer.invoke("metis:retry-connection"),
    reopen: () => ipcRenderer.invoke("metis:reopen"),
    openSettings: () => ipcRenderer.invoke("metis:open-settings"),
    getSettings: () => ipcRenderer.invoke("metis:get-settings"),
    updateSettings: (patch: Partial<Settings>) =>
      ipcRenderer.invoke("metis:update-settings", patch),
    chooseDownloadFolder: () => ipcRenderer.invoke("metis:choose-download-folder"),
    checkForUpdates: () => ipcRenderer.invoke("metis:check-for-updates"),
    downloadUpdate: () => ipcRenderer.invoke("metis:download-update"),
    clearCache: () => ipcRenderer.invoke("metis:clear-cache"),
    showLog: () => ipcRenderer.invoke("metis:show-log"),
    resetApp: () => ipcRenderer.invoke("metis:reset-app"),
    restart: () => ipcRenderer.invoke("metis:restart"),
  } satisfies MetisBridge);
}

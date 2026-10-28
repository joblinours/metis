import { addEventListener } from "@react-native-community/netinfo";
import { AppState, Linking } from "react-native";

import { log } from "./log";
import { handleLink, reconnectOrRefresh, route, setNetworkOnline } from "./shell";
import { checkForUpdatesIfDue } from "./update";

let started = false;

export function startShell() {
  if (started) return;
  started = true;

  addEventListener((state) => {
    setNetworkOnline(state.isConnected !== false);
  });

  let appState = AppState.currentState;
  AppState.addEventListener("change", (next) => {
    const resumed = appState !== "active" && next === "active";
    appState = next;
    if (!resumed) return;
    log("app resumed");
    void reconnectOrRefresh("resume");
    void checkForUpdatesIfDue("resume");
  });

  Linking.addEventListener("url", ({ url }) => {
    void handleLink(url, "open-url");
  });

  void Linking.getInitialURL().then(async (link) => {
    log("app started", { launchedWithLink: Boolean(link) });
    if (!link || !(await handleLink(link, "launch"))) await route();
  });

  void checkForUpdatesIfDue("start");
}

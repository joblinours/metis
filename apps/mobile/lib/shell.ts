import { parseDeepLink } from "@metis/shell-core/links";
import { isRestorablePath, normalizeServer } from "@metis/shell-core/store";
import { fetch as fetchNetworkState } from "@react-native-community/netinfo";
import { Alert, Linking } from "react-native";
import { create } from "zustand";

import { clearCache as clearWebCache } from "@/modules/metis-shell";

import {
  beginLogin,
  checkServer,
  completeLogin,
  connectTicketUrl,
  hasSession,
  StaleLoginError,
  signOut,
} from "./auth";
import { log, urlPath } from "./log";
import { DEFAULT_SETTINGS, readSettings, writeSettings } from "./settings";
import type { OfflineReason, Settings } from "./settings-types";
import { readLastPath, readServer, resetStore, writeLastPath, writeServer } from "./store";

export const HOME_PATH = "/w";

export type LoadingStatus = "opening" | "signing-in";

export type Screen =
  | { kind: "loading"; status: LoadingStatus }
  | { kind: "setup" }
  | { kind: "signin"; error: string | null }
  | { kind: "offline"; reason: OfflineReason }
  | { kind: "server"; url: string; load: number };

interface ShellState {
  screen: Screen;
  server: string | null;
  settings: Settings;
  networkOnline: boolean;
}

export const useShell = create<ShellState>(() => ({
  screen: { kind: "loading", status: "opening" },
  server: readServer(),
  settings: readSettings(),
  networkOnline: true,
}));

let reconnecting = false;
let lastServerPath: string | null = null;
let loads = 0;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setScreen(screen: Screen) {
  useShell.setState({ screen, server: readServer() });
}

function offlineShown(): OfflineReason | null {
  const { screen } = useShell.getState();
  return screen.kind === "offline" ? screen.reason : null;
}

export function showOffline(trigger: string) {
  const reason: OfflineReason = useShell.getState().networkOnline ? "unreachable" : "offline";
  if (offlineShown() === reason) return;
  log("showing offline screen", { trigger, reason });
  setScreen({ kind: "offline", reason });
}

export function showLocal(page: "setup" | "signin", error: string | null = null) {
  log("showing local screen", { page, error });
  setScreen(page === "setup" ? { kind: "setup" } : { kind: "signin", error });
}

function showLoading(status: LoadingStatus) {
  const { screen } = useShell.getState();
  if (screen.kind === "loading" && screen.status === status) return;
  setScreen({ kind: "loading", status });
}

export function showServer(pathname: string) {
  const server = readServer();
  if (!server) {
    showLocal("setup");
    return;
  }
  log("loading server page", { path: pathname });
  loads += 1;
  setScreen({ kind: "server", url: `${server}${pathname}`, load: loads });
}

function startPath(): string {
  if (!readSettings().restoreLastPage) return HOME_PATH;
  return readLastPath() ?? HOME_PATH;
}

export async function route() {
  const server = readServer();
  if (!server) {
    showLocal("setup");
    return;
  }
  showLoading("opening");
  try {
    const signedIn = await hasSession(server);
    log("route", { signedIn });
    if (signedIn) showServer(startPath());
    else showLocal("signin");
  } catch (error) {
    log("route failed", { message: errorText(error) });
    showOffline("start-up");
  }
}

export async function reconnect(trigger: string): Promise<{ ok: boolean; reason?: OfflineReason }> {
  if (!offlineShown()) return { ok: true };
  const server = readServer();
  if (!server) {
    showLocal("setup");
    return { ok: true };
  }
  const network = await fetchNetworkState();
  if (network.isConnected === false) {
    log("reconnect skipped while offline", { trigger });
    return { ok: false, reason: "offline" };
  }
  if (reconnecting) return { ok: false, reason: "unreachable" };
  reconnecting = true;
  log("reconnect attempt", { trigger });
  try {
    const signedIn = await hasSession(server);
    log("server answered", { trigger, signedIn });
    if (signedIn) showServer(lastServerPath ?? HOME_PATH);
    else showLocal("signin");
    return { ok: true };
  } catch (error) {
    log("server still unreachable", { trigger, message: errorText(error) });
    return { ok: false, reason: "unreachable" };
  } finally {
    reconnecting = false;
  }
}

export async function reconnectOrRefresh(trigger: string) {
  const result = await reconnect(trigger);
  if (!result.ok) showOffline(trigger);
}

export function setNetworkOnline(online: boolean) {
  if (online === useShell.getState().networkOnline) return;
  useShell.setState({ networkOnline: online });
  log("network changed", { online });
  if (online) void reconnectOrRefresh("online");
}

export function rememberServerPage(raw: string) {
  const server = readServer();
  try {
    const url = new URL(raw);
    if (url.origin !== server || url.pathname === "/") return;
    lastServerPath = `${url.pathname}${url.search}`;
    if (readSettings().restoreLastPage && isRestorablePath(lastServerPath)) {
      writeLastPath(lastServerPath);
    }
  } catch {
    return;
  }
}

async function isSignedIn(server: string): Promise<boolean> {
  try {
    return await hasSession(server);
  } catch {
    return false;
  }
}

export async function handleLink(raw: string, source: string): Promise<boolean> {
  const link = parseDeepLink(raw);
  const server = readServer();
  log("deep link received", {
    source,
    kind: link?.kind ?? "invalid",
    paired: Boolean(server),
  });
  if (!link || !server) return false;

  if (link.kind === "open") {
    showServer(link.path);
    return true;
  }

  showLoading("signing-in");
  try {
    await completeLogin(server, link.code, link.state);
    log("sign-in completed");
    showServer(HOME_PATH);
  } catch (error) {
    if (error instanceof StaleLoginError && (await isSignedIn(server))) {
      log("stale sign-in link while already signed in");
      showServer(HOME_PATH);
      return true;
    }
    log("sign-in failed", { message: errorText(error) });
    showLocal("signin", errorText(error));
  }
  return true;
}

export function signInRequired(url: string) {
  log("server asked for sign-in", { url: urlPath(url) });
  showLocal("signin");
}

export async function connectInBrowser(url: string) {
  const server = readServer();
  if (!server) return;
  const target = new URL(url);
  try {
    const ticketUrl = await connectTicketUrl(server, `${target.pathname}${target.search}`);
    await Linking.openURL(ticketUrl);
  } catch (err) {
    Alert.alert("Could not connect the account", err instanceof Error ? err.message : "Try again.");
  }
}

export async function setServer(input: string): Promise<{ ok: boolean; error?: string }> {
  const server = normalizeServer(input);
  if (!server) {
    return {
      ok: false,
      error: "Enter your server's address, for example mail.example.com",
    };
  }
  if (!(await checkServer(server))) {
    return { ok: false, error: `No Metis server answered at ${server}.` };
  }
  writeServer(server);
  await route();
  return { ok: true };
}

export async function signIn() {
  const server = readServer();
  if (!server) return;
  await Linking.openURL(await beginLogin(server));
}

export async function signOutAndRoute() {
  await signOut(readServer());
  writeLastPath(null);
  lastServerPath = null;
  await route();
}

export async function changeServer() {
  await signOut(readServer());
  writeServer(null);
  lastServerPath = null;
  showLocal("setup");
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const previous = readSettings();
  const next = writeSettings(patch);
  if (previous.restoreLastPage && !next.restoreLastPage) writeLastPath(null);
  useShell.setState({ settings: next });
  return next;
}

export async function clearCache(): Promise<boolean> {
  try {
    await clearWebCache();
    return true;
  } catch (error) {
    log("clear cache failed", { message: errorText(error) });
    return false;
  }
}

export async function resetApp() {
  await signOut(readServer());
  resetStore();
  lastServerPath = null;
  useShell.setState({ settings: DEFAULT_SETTINGS });
  showLocal("setup");
}

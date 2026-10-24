import { type BrowserWindowConstructorOptions, shell, type WebContents } from "electron";

import { SETTINGS_PATH } from "./links";

const SIGN_IN_PATHS = new Set([
  "/",
  "/2fa/verify",
  "/setup",
  "/forgot-password",
  "/reset-password",
]);
const BROWSER_ONLY_PREFIXES = ["/invite/", "/oauth/", "/native/"];
const CONNECT_PREFIX = "/api/connections/start/";
const DOWNLOAD_PATH = "/api/drive/download";
const BROWSER_SESSION_HOSTS = [/(^|\.)google\.com$/, /(^|\.)googleusercontent\.com$/];
const EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

export interface NavigationHooks {
  server(): string | null;
  signInRequired(url: string): void;
  connect(url: string): void;
  settings(): void;
  childWindowOptions(): BrowserWindowConstructorOptions;
}

type Decision = "allow" | "sign-in" | "connect" | "settings" | "external";

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function openExternal(raw: string): void {
  const url = parse(raw);
  if (url && EXTERNAL_PROTOCOLS.has(url.protocol)) {
    void shell.openExternal(url.toString());
  }
}

function decide(url: URL, server: string | null): Decision {
  if (!server || url.origin !== server) return "external";
  if (SIGN_IN_PATHS.has(url.pathname)) return "sign-in";
  if (url.pathname.startsWith(CONNECT_PREFIX)) return "connect";
  if (url.pathname === SETTINGS_PATH) return "settings";
  if (BROWSER_ONLY_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return "external";
  }
  return "allow";
}

function needsBrowserSession(url: URL): boolean {
  return BROWSER_SESSION_HOSTS.some((host) => host.test(url.hostname));
}

export function attachNavigation(contents: WebContents, hooks: NavigationHooks): void {
  let downloading = false;

  const apply = (decision: Decision, url: URL) => {
    if (decision === "sign-in") hooks.signInRequired(url.toString());
    else if (decision === "connect") hooks.connect(url.toString());
    else if (decision === "settings") hooks.settings();
    else if (decision === "external") openExternal(url.toString());
  };

  contents.on("did-start-navigation", (event) => {
    if (!event.isMainFrame || event.isSameDocument) return;
    const url = parse(event.url);
    downloading = url !== null && url.origin === hooks.server() && url.pathname === DOWNLOAD_PATH;
  });

  contents.on("will-navigate", (event) => {
    const url = parse(event.url);
    if (!url || url.protocol === "file:") {
      event.preventDefault();
      return;
    }
    const decision = decide(url, hooks.server());
    if (decision === "allow") return;
    event.preventDefault();
    apply(decision, url);
  });

  contents.on("did-navigate-in-page", (_event, raw, isMainFrame) => {
    if (!isMainFrame) return;
    const url = parse(raw);
    if (url && decide(url, hooks.server()) === "sign-in") {
      hooks.signInRequired(url.toString());
    }
  });

  contents.on("will-redirect", (event) => {
    if (!event.isMainFrame) return;
    const url = parse(event.url);
    if (!url) {
      event.preventDefault();
      return;
    }
    if (url.origin !== hooks.server() && downloading) {
      event.preventDefault();
      if (needsBrowserSession(url)) openExternal(url.toString());
      else contents.downloadURL(url.toString());
      return;
    }
    const decision = decide(url, hooks.server());
    if (decision === "allow") return;
    event.preventDefault();
    apply(decision, url);
  });

  contents.setWindowOpenHandler(({ url: raw }) => {
    if (raw === "" || raw === "about:blank") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: hooks.childWindowOptions(),
      };
    }
    const url = parse(raw);
    if (!url) return { action: "deny" };
    const decision = decide(url, hooks.server());
    if (decision === "allow") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: hooks.childWindowOptions(),
      };
    }
    apply(decision, url);
    return { action: "deny" };
  });

  contents.on("did-create-window", (child) => {
    attachNavigation(child.webContents, hooks);
  });
}

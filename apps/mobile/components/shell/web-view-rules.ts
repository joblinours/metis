import { USER_AGENT_TOKEN } from "@metis/shell-core/links";
import {
  type Decision,
  decide,
  isDownload,
  needsBrowserSession,
  parse,
} from "@metis/shell-core/navigation";
import { nativeApplicationVersion } from "expo-application";
import { router } from "expo-router";
import { useRef } from "react";
import { Alert, Platform } from "react-native";
import type {
  FileDownloadEvent,
  ShouldStartLoadRequest,
} from "react-native-webview/lib/WebViewTypes";

import { downloadAndShare } from "@/lib/downloads";
import { log } from "@/lib/log";
import { openExternal } from "@/lib/navigation";
import { connectInBrowser, signInRequired } from "@/lib/shell";
import { readServer } from "@/lib/store";

const IN_DOCUMENT_PROTOCOLS = new Set(["about:", "data:", "blob:", "javascript:"]);

export const USER_AGENT = `${USER_AGENT_TOKEN}/${nativeApplicationVersion ?? "0"}`;

function startDownload(url: string) {
  downloadAndShare(url).catch((error: unknown) => {
    log("download failed", { message: String(error) });
    Alert.alert("Download failed", error instanceof Error ? error.message : "Try again.");
  });
}

export function apply(decision: Decision, url: URL) {
  if (decision === "sign-in") signInRequired(url.toString());
  else if (decision === "connect") void connectInBrowser(url.toString());
  else if (decision === "settings") router.push("/settings");
  else if (decision === "external") openExternal(url.toString());
}

export function openPopup(url: URL) {
  log("popup opened");
  router.push({ pathname: "/popup", params: { url: url.toString() } });
}

export function useServerRequests() {
  const downloading = useRef(false);
  const downloadRedirect = useRef(false);

  function onShouldStartLoadWithRequest(request: ShouldStartLoadRequest) {
    if (!request.isTopFrame) return true;
    const target = parse(request.url);
    if (!target) return false;
    if (IN_DOCUMENT_PROTOCOLS.has(target.protocol)) return true;
    const server = readServer();
    downloadRedirect.current = false;
    const wasDownloading = downloading.current;
    downloading.current = isDownload(target, server);
    if (downloading.current) return true;

    const redirected = Platform.OS === "android" || request.navigationType === "other";
    if (wasDownloading && redirected && target.origin !== server) {
      if (needsBrowserSession(target)) {
        openExternal(target.toString());
        return false;
      }
      if (Platform.OS === "ios") {
        startDownload(target.toString());
        return false;
      }
      downloadRedirect.current = true;
      return true;
    }

    const decision = decide(target, server);
    if (decision === "allow") return true;
    apply(decision, target);
    return false;
  }

  function onFileDownload({ nativeEvent }: FileDownloadEvent) {
    downloading.current = false;
    startDownload(nativeEvent.downloadUrl);
  }

  function takeDownloadRedirect(): boolean {
    const was = downloadRedirect.current;
    downloadRedirect.current = false;
    return was;
  }

  return { onShouldStartLoadWithRequest, onFileDownload, takeDownloadRedirect };
}

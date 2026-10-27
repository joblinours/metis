import { nativeApplicationVersion } from "expo-application";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Platform, View } from "react-native";
import { WebView } from "react-native-webview";
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewNavigation,
  WebViewOpenWindowEvent,
} from "react-native-webview/lib/WebViewTypes";
import { useCSSVariable } from "uniwind";

import { LoadingScreen } from "@/components/shell/loading-screen";
import { Text } from "@/components/ui/text";
import { downloadAndShare } from "@/lib/downloads";
import { USER_AGENT_TOKEN } from "@/lib/links";
import { log, urlPath } from "@/lib/log";
import {
  type Decision,
  decide,
  isDownload,
  needsBrowserSession,
  openExternal,
  parse,
} from "@/lib/navigation";
import {
  connectInBrowser,
  HOME_PATH,
  rememberServerPage,
  showLocal,
  showOffline,
  showServer,
  signInRequired,
  useShell,
} from "@/lib/shell";
import { readServer } from "@/lib/store";

const IOS_NETWORK_ERRORS = new Set([-1001, -1003, -1004, -1005, -1006, -1009, -1018, -1020]);
const ANDROID_NETWORK_ERRORS = new Set([-2, -6, -7, -8]);
const IN_DOCUMENT_PROTOCOLS = new Set(["about:", "data:", "blob:", "javascript:"]);

function isIgnorableError(domain: string | undefined, code: number): boolean {
  if (domain === "NSURLErrorDomain" && code === -999) return true;
  return domain === "WebKitErrorDomain" && (code === 102 || code === 204);
}

function isNetworkError(domain: string | undefined, code: number): boolean {
  if (Platform.OS === "ios") {
    return domain === "NSURLErrorDomain" && IOS_NETWORK_ERRORS.has(code);
  }
  return ANDROID_NETWORK_ERRORS.has(code);
}

function startDownload(url: string) {
  downloadAndShare(url).catch((error: unknown) => {
    log("download failed", { message: String(error) });
    Alert.alert("Download failed", error instanceof Error ? error.message : "Try again.");
  });
}

function apply(decision: Decision, url: URL) {
  if (decision === "sign-in") signInRequired(url.toString());
  else if (decision === "connect") void connectInBrowser(url.toString());
  else if (decision === "settings") router.push("/settings");
  else if (decision === "external") openExternal(url.toString());
}

export function ServerView({ url }: { url: string }) {
  const webView = useRef<WebView>(null);
  const downloading = useRef(false);
  const downloadRedirect = useRef(false);
  const loggedLoad = useRef({ url: "", at: 0 });
  const canGoBack = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const textZoom = useShell((state) => state.settings.textZoom);
  const networkOnline = useShell((state) => state.networkOnline);
  const background = useCSSVariable("--color-background");

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false;
      webView.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

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

  function onNavigationStateChange(navigation: WebViewNavigation) {
    canGoBack.current = navigation.canGoBack;
    rememberServerPage(navigation.url);
    const target = parse(navigation.url);
    if (target && decide(target, readServer()) === "sign-in") {
      signInRequired(target.toString());
    }
  }

  function onError(event: WebViewErrorEvent) {
    const { domain, code, description } = event.nativeEvent;
    if (isIgnorableError(domain, code)) {
      log("server page load replaced", { code });
      return;
    }
    const failed = parse(event.nativeEvent.url);
    log("main frame load failed", {
      domain,
      code,
      description,
      url: failed ? urlPath(failed.toString()) : "invalid",
    });
    if (failed && failed.origin !== readServer()) {
      const wasDownload = downloadRedirect.current;
      downloadRedirect.current = false;
      Alert.alert(wasDownload ? "Download failed" : `Could not open ${failed.origin}`, description);
      if (canGoBack.current) webView.current?.goBack();
      else showServer(HOME_PATH);
      return;
    }
    if (isNetworkError(domain, code)) {
      showOffline("load-failed");
      return;
    }
    showLocal("signin", `Could not open ${readServer()}: ${description}`);
  }

  function onOpenWindow(event: WebViewOpenWindowEvent) {
    const target = parse(event.nativeEvent.targetUrl);
    if (!target) return;
    const decision = decide(target, readServer());
    if (decision !== "allow") {
      apply(decision, target);
      return;
    }
    webView.current?.injectJavaScript(
      `window.location.assign(${JSON.stringify(target.toString())});true;`,
    );
  }

  return (
    <View className="flex-1 bg-background pt-safe">
      {networkOnline ? null : (
        <View className="items-center border-b border-border py-1">
          <Text className="text-xs text-muted-foreground">Offline</Text>
        </View>
      )}
      <View className="flex-1 pb-safe">
        <WebView
          ref={webView}
          source={{ uri: url }}
          style={{ backgroundColor: String(background) }}
          applicationNameForUserAgent={`${USER_AGENT_TOKEN}/${nativeApplicationVersion ?? "0"}`}
          sharedCookiesEnabled
          webviewDebuggingEnabled={__DEV__}
          textZoom={textZoom}
          allowsInlineMediaPlayback
          allowsBackForwardNavigationGestures
          mediaCapturePermissionGrantType="deny"
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onNavigationStateChange={onNavigationStateChange}
          onLoad={({ nativeEvent }) => {
            const loadedUrl = parse(nativeEvent.url);
            if (!loadedUrl || loadedUrl.origin !== readServer()) return;
            const now = Date.now();
            const last = loggedLoad.current;
            if (last.url === nativeEvent.url && now - last.at < 2000) return;
            loggedLoad.current = { url: nativeEvent.url, at: now };
            log("server page loaded", { url: urlPath(nativeEvent.url) });
          }}
          onLoadEnd={() => setLoaded(true)}
          onError={onError}
          onFileDownload={({ nativeEvent }) => {
            downloading.current = false;
            startDownload(nativeEvent.downloadUrl);
          }}
          onOpenWindow={onOpenWindow}
          onContentProcessDidTerminate={() => webView.current?.reload()}
          onRenderProcessGone={() => webView.current?.reload()}
        />
        {loaded ? null : (
          <View className="absolute inset-0">
            <LoadingScreen status="opening" />
          </View>
        )}
      </View>
    </View>
  );
}

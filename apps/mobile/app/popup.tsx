import { decide, parse } from "@metis/shell-core/navigation";
import { router, useLocalSearchParams } from "expo-router";
import { X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Alert, View } from "react-native";
import { WebView } from "react-native-webview";
import type {
  WebViewErrorEvent,
  WebViewNavigation,
  WebViewOpenWindowEvent,
} from "react-native-webview/lib/WebViewTypes";
import { useCSSVariable } from "uniwind";

import { apply, USER_AGENT, useServerRequests } from "@/components/shell/web-view-rules";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { log, urlPath } from "@/lib/log";
import { signInRequired, useShell } from "@/lib/shell";
import { readServer } from "@/lib/store";

function allowed(raw: string | undefined): string | null {
  const target = raw ? parse(raw) : null;
  return target && decide(target, readServer()) === "allow" ? target.toString() : null;
}

function close() {
  if (router.canGoBack()) router.back();
}

export default function PopupScreen() {
  const params = useLocalSearchParams<{ url?: string }>();
  const [url] = useState(() => allowed(params.url));
  const [title, setTitle] = useState("");
  const webView = useRef<WebView>(null);
  const textZoom = useShell((state) => state.settings.textZoom);
  const background = useCSSVariable("--color-background");
  const { onShouldStartLoadWithRequest, onFileDownload } = useServerRequests();

  function onNavigationStateChange(navigation: WebViewNavigation) {
    setTitle(navigation.title ?? "");
    const target = parse(navigation.url);
    if (target && decide(target, readServer()) === "sign-in") {
      close();
      signInRequired(target.toString());
    }
  }

  function onError(event: WebViewErrorEvent) {
    const { code, description } = event.nativeEvent;
    log("popup load failed", { code, url: urlPath(event.nativeEvent.url) });
    Alert.alert("Could not open the page", description);
    close();
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
      <View className="h-12 flex-row items-center justify-between gap-4 border-b border-border px-4">
        <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-medium">
          {title}
        </Text>
        <Button variant="ghost" size="icon" accessibilityLabel="Close" onPress={close}>
          <Icon as={X} className="size-5 text-muted-foreground" />
        </Button>
      </View>
      <View className="flex-1 pb-safe">
        {url ? (
          <WebView
            ref={webView}
            source={{ uri: url }}
            style={{ backgroundColor: String(background) }}
            applicationNameForUserAgent={USER_AGENT}
            sharedCookiesEnabled
            webviewDebuggingEnabled={__DEV__}
            textZoom={textZoom}
            allowsInlineMediaPlayback
            mediaCapturePermissionGrantType="deny"
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onNavigationStateChange={onNavigationStateChange}
            onError={onError}
            onFileDownload={onFileDownload}
            onOpenWindow={onOpenWindow}
            onContentProcessDidTerminate={() => webView.current?.reload()}
            onRenderProcessGone={() => webView.current?.reload()}
          />
        ) : (
          <View className="flex-1 items-center justify-center p-4">
            <Text className="text-sm text-muted-foreground">This page can't open here.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

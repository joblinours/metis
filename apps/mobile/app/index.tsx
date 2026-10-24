import { LoadingScreen } from "@/components/shell/loading-screen";
import { OfflineScreen } from "@/components/shell/offline-screen";
import { ServerView } from "@/components/shell/server-view";
import { SetupScreen } from "@/components/shell/setup-screen";
import { SignInScreen } from "@/components/shell/signin-screen";
import { useShell } from "@/lib/shell";

export default function Shell() {
  const screen = useShell((state) => state.screen);
  switch (screen.kind) {
    case "loading":
      return <LoadingScreen status={screen.status} />;
    case "setup":
      return <SetupScreen />;
    case "signin":
      return <SignInScreen error={screen.error} />;
    case "offline":
      return <OfflineScreen reason={screen.reason} />;
    case "server":
      return <ServerView key={screen.load} url={screen.url} />;
  }
}

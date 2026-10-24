import { NativeModule, requireNativeModule } from "expo";

declare class MetisShellModule extends NativeModule {
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
}

const MetisShell = requireNativeModule<MetisShellModule>("MetisShell");

export function clearStorageData(): Promise<void> {
  return MetisShell.clearStorageData();
}

export function clearCache(): Promise<void> {
  return MetisShell.clearCache();
}

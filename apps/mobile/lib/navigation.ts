import { EXTERNAL_PROTOCOLS, parse } from "@metis/shell-core/navigation";
import { Linking } from "react-native";

export function openExternal(raw: string): void {
  const url = parse(raw);
  if (url && EXTERNAL_PROTOCOLS.has(url.protocol)) {
    void Linking.openURL(url.toString());
  }
}

import { getInstanceConfig } from "@/config/runtime";

import { PrivacySettings } from "./_components/privacy-settings";

export default function PrivacySettingsPage() {
  return <PrivacySettings imageProxy={getInstanceConfig().imageProxy.enabled} />;
}

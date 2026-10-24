import { useState } from "react";
import { View } from "react-native";

import { Screen, ScreenError, ScreenLinks } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { setServer } from "@/lib/shell";

export function SetupScreen() {
  const [address, setAddress] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setChecking(true);
    const result = await setServer(address);
    if (!result.ok) {
      setError(result.error ?? "Could not reach that server.");
      setChecking(false);
    }
  }

  return (
    <Screen title="Metis Suite" description="Connect to your Metis Suite server">
      <View className="gap-1.5">
        <Label
          nativeID="server-label"
          className="text-xs font-medium tracking-[1.5px] text-muted-foreground uppercase"
        >
          Server address
        </Label>
        <Input
          aria-labelledby="server-label"
          placeholder="https://mail.example.com"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="url"
          textContentType="URL"
          returnKeyType="go"
          autoFocus
          editable={!checking}
          value={address}
          onChangeText={setAddress}
          onSubmitEditing={() => void submit()}
        />
      </View>
      <ScreenError message={error} />
      <Button
        size="lg"
        className="mt-1 w-full"
        disabled={checking || address.trim() === ""}
        onPress={() => void submit()}
      >
        <Text>{checking ? "Checking…" : "Continue"}</Text>
      </Button>
      <ScreenLinks />
    </Screen>
  );
}

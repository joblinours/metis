import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import { Label } from "@metis/ui/components/label";
import { type FormEvent, useState } from "react";

import { mount } from "../mount";
import { Screen, ScreenError, ScreenLinks } from "../screen";

function Setup() {
  const [address, setAddress] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setChecking(true);
    const result = await window.metis.setServer(address);
    if (!result?.ok) {
      setError(result?.error ?? "Could not reach that server.");
      setChecking(false);
    }
  }

  return (
    <Screen title="Metis Suite" description="Connect to your Metis Suite server">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="server"
            className="text-xs font-medium tracking-[1.5px] text-muted-foreground uppercase"
          >
            Server address
          </Label>
          <Input
            id="server"
            type="url"
            placeholder="https://mail.example.com"
            autoComplete="url"
            required
            autoFocus
            disabled={checking}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>
        <ScreenError message={error} />
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={checking}>
          {checking ? "Checking…" : "Continue"}
        </Button>
        <ScreenLinks />
      </form>
    </Screen>
  );
}

mount(<Setup />);

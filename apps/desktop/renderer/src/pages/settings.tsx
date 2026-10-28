import { Button } from "@metis/ui/components/button";
import { ButtonGroup } from "@metis/ui/components/button-group";
import { Label } from "@metis/ui/components/label";
import { Switch } from "@metis/ui/components/switch";
import { cn } from "@metis/ui/lib/utils";
import { Download, Info, type LucideIcon, Server, SlidersHorizontal, Wrench } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";

import type {
  DownloadMode,
  SettingsPayload,
  SettingsSection,
  Settings as SettingsValues,
  UpdateInfo,
} from "../../../src/settings-types";
import { mount, queryParam } from "../mount";

const SECTION_KEY = "metis-settings-section";

type SectionId = SettingsSection;

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "server", label: "Server", icon: Server },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "advanced", label: "Advanced", icon: Wrench },
  { id: "about", label: "About", icon: Info },
];

const DOWNLOAD_MODES: { mode: DownloadMode; label: string }[] = [
  { mode: "ask", label: "Ask where to save" },
  { mode: "folder", label: "Save to a folder" },
];

function sectionFrom(value: string | null): SectionId | null {
  return SECTIONS.find((section) => section.id === value)?.id ?? null;
}

function readSection(): SectionId | null {
  const requested = sectionFrom(queryParam("section"));
  if (requested) return requested;
  try {
    return sectionFrom(window.localStorage.getItem(SECTION_KEY));
  } catch {
    return null;
  }
}

function writeSection(section: SectionId) {
  try {
    window.localStorage.setItem(SECTION_KEY, section);
  } catch {
    return;
  }
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border rounded-xl border border-border">{children}</div>;
}

function Row({
  title,
  description,
  htmlFor,
  children,
}: {
  title: string;
  description?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-6 px-4 py-3">
      <span className="min-w-0">
        <Label htmlFor={htmlFor} className="block text-sm font-medium">
          {title}
        </Label>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

function SwitchRow({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: keyof SettingsValues;
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (patch: Partial<SettingsValues>) => void;
}) {
  return (
    <Row title={title} description={description} htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={(next) => onChange({ [id]: next })} />
    </Row>
  );
}

function ValueText({ children }: { children: ReactNode }) {
  return (
    <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function DownloadModePicker({
  value,
  onChoose,
}: {
  value: DownloadMode;
  onChoose: (mode: DownloadMode) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const index = DOWNLOAD_MODES.findIndex((entry) => entry.mode === value);
    const next = DOWNLOAD_MODES[(index + step + DOWNLOAD_MODES.length) % DOWNLOAD_MODES.length];
    if (next) onChoose(next.mode);
  }

  return (
    <ButtonGroup role="radiogroup" aria-label="When a download starts">
      {DOWNLOAD_MODES.map(({ mode, label }) => {
        const checked = value === mode;
        return (
          <Button
            key={mode}
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            variant={checked ? "default" : "outline"}
            onClick={() => onChoose(mode)}
            onKeyDown={onKeyDown}
          >
            {label}
          </Button>
        );
      })}
    </ButtonGroup>
  );
}

function updateText(update: UpdateInfo, version: string): string {
  switch (update.state) {
    case "idle":
      return `You have version ${version}.`;
    case "checking":
      return "Checking for updates…";
    case "current":
      return "Up to date.";
    case "available":
      return `Version ${update.version} is available.`;
    case "failed":
      return "Could not check for updates. Try again later.";
  }
}

function SettingsWindow() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [section, setSection] = useState<SectionId>(() => readSection() ?? "general");
  const [cacheStatus, setCacheStatus] = useState("Keeps you signed in.");

  useEffect(() => {
    async function load() {
      setPayload(await window.metis.getSettings());
      if (queryParam("check") !== "1") return;
      setPayload((previous) => previous && { ...previous, update: { state: "checking" } });
      const next = await window.metis.checkForUpdates();
      if (next) setPayload(next);
    }
    void load();
  }, []);

  function show(next: SectionId) {
    setSection(next);
    writeSection(next);
  }

  async function update(patch: Partial<SettingsValues>) {
    const next = await window.metis.updateSettings(patch);
    if (next) setPayload(next);
  }

  async function chooseFolder() {
    const next = await window.metis.chooseDownloadFolder();
    if (next) setPayload(next);
  }

  async function chooseMode(mode: DownloadMode) {
    if (mode === "folder" && !payload?.settings.downloadFolder) {
      await chooseFolder();
      return;
    }
    await update({ downloadMode: mode });
  }

  async function checkForUpdates() {
    setPayload((previous) => previous && { ...previous, update: { state: "checking" } });
    const next = await window.metis.checkForUpdates();
    if (next) setPayload(next);
  }

  async function clearCache() {
    const cleared = await window.metis.clearCache();
    setCacheStatus(cleared ? "Cache cleared." : "Could not clear the cache.");
  }

  const settings = payload?.settings;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside
        className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border px-3 py-6"
        aria-label="Settings"
      >
        <h1 className="mb-4 px-2.5 text-lg font-semibold tracking-tight">Settings</h1>
        <nav className="flex flex-col gap-px">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              aria-current={section === id ? "page" : undefined}
              className={cn(
                "w-full justify-start gap-2.5 text-muted-foreground",
                section === id && "bg-muted font-medium text-foreground",
              )}
              onClick={() => show(id)}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-10 py-8">
          {settings && payload ? (
            <>
              {section === "general" ? (
                <Panel
                  title="General"
                  description="How Metis Suite starts and closes on this computer."
                >
                  <Rows>
                    <SwitchRow
                      id="openAtLogin"
                      title="Open when you log in"
                      description="Starts Metis Suite with your computer."
                      checked={settings.openAtLogin}
                      onChange={update}
                    />
                    <SwitchRow
                      id="startMinimized"
                      title="Start in the background"
                      description="When opened at login, stays in the tray, or minimised if the tray is off."
                      checked={settings.startMinimized}
                      onChange={update}
                    />
                    <SwitchRow
                      id="closeToTray"
                      title="Close to tray"
                      description={
                        <>
                          Closing the window keeps Metis Suite running in the system tray.
                          {payload.platform === "linux" ? (
                            <span className="mt-1 block">
                              On GNOME the tray icon needs the AppIndicator extension, which Ubuntu
                              turns on by default.
                            </span>
                          ) : null}
                        </>
                      }
                      checked={settings.closeToTray}
                      onChange={update}
                    />
                    <SwitchRow
                      id="restoreLastPage"
                      title="Open where you left off"
                      description="Reopens the last page you had open instead of your home workspace."
                      checked={settings.restoreLastPage}
                      onChange={update}
                    />
                    <SwitchRow
                      id="checkForUpdates"
                      title="Check for updates"
                      description="Asks downloads.trymetis.email once a day whether a newer version exists. Your server is never contacted."
                      checked={settings.checkForUpdates}
                      onChange={update}
                    />
                  </Rows>
                </Panel>
              ) : null}

              {section === "server" ? (
                <Panel title="Server" description="The Metis instance this app opens.">
                  <Rows>
                    <Row
                      title="Address"
                      description={<ValueText>{payload.server ?? "No server"}</ValueText>}
                    >
                      <Button variant="outline" onClick={() => void window.metis.changeServer()}>
                        Change server…
                      </Button>
                    </Row>
                    <Row
                      title="Sign out"
                      description="Signs this app out. Your browser stays signed in."
                    >
                      <Button variant="outline" onClick={() => void window.metis.signOut()}>
                        Sign out
                      </Button>
                    </Row>
                  </Rows>
                </Panel>
              ) : null}

              {section === "downloads" ? (
                <Panel
                  title="Downloads"
                  description="Where files you download from Metis Suite are saved."
                >
                  <Rows>
                    <Row title="When a download starts">
                      <DownloadModePicker
                        value={settings.downloadMode}
                        onChoose={(mode) => void chooseMode(mode)}
                      />
                    </Row>
                    {settings.downloadMode === "folder" ? (
                      <Row
                        title="Folder"
                        description={
                          <ValueText>
                            {settings.downloadFolder ?? payload.defaultDownloadFolder}
                          </ValueText>
                        }
                      >
                        <Button variant="outline" onClick={() => void chooseFolder()}>
                          Change…
                        </Button>
                      </Row>
                    ) : null}
                    <SwitchRow
                      id="downloadNotify"
                      title="Notify when a download finishes"
                      description="Click the notification to show the file in its folder."
                      checked={settings.downloadNotify}
                      onChange={update}
                    />
                  </Rows>
                </Panel>
              ) : null}

              {section === "advanced" ? (
                <Panel
                  title="Advanced"
                  description="Troubleshooting for this app on this computer."
                >
                  <Rows>
                    <SwitchRow
                      id="hardwareAcceleration"
                      title="Hardware acceleration"
                      description="Turn off if the window flickers or stays blank."
                      checked={settings.hardwareAcceleration}
                      onChange={update}
                    />
                    {payload.restartRequired ? (
                      <div className="flex min-h-14 items-center justify-between gap-6 bg-muted px-4 py-3">
                        <span className="text-sm">Restart Metis Suite to apply this change.</span>
                        <Button onClick={() => void window.metis.restart()}>Restart now</Button>
                      </div>
                    ) : null}
                    <Row title="Clear cache" description={cacheStatus}>
                      <Button variant="outline" onClick={() => void clearCache()}>
                        Clear
                      </Button>
                    </Row>
                    <Row
                      title="Reset the app"
                      description="Signs out, forgets the server and restores default settings."
                    >
                      <Button
                        variant="outline"
                        className="text-destructive-text"
                        onClick={() => void window.metis.resetApp()}
                      >
                        Reset…
                      </Button>
                    </Row>
                  </Rows>
                </Panel>
              ) : null}

              {section === "about" ? (
                <Panel title="About" description="Versions and logs for bug reports.">
                  <dl className="divide-y divide-border rounded-xl border border-border">
                    {(
                      [
                        ["Version", payload.about.version],
                        ["Electron", payload.about.electron],
                        ["Chromium", payload.about.chrome],
                      ] as const
                    ).map(([label, value]) => (
                      <div
                        key={label}
                        className="flex min-h-11 items-center justify-between gap-6 px-4 py-2.5 text-sm"
                      >
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-mono">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <Rows>
                    <Row
                      title="Updates"
                      description={updateText(payload.update, payload.about.version)}
                    >
                      {payload.update.state === "available" ? (
                        <Button onClick={() => void window.metis.downloadUpdate()}>Download</Button>
                      ) : (
                        <Button
                          variant="outline"
                          disabled={payload.update.state === "checking"}
                          onClick={() => void checkForUpdates()}
                        >
                          Check now
                        </Button>
                      )}
                    </Row>
                  </Rows>
                  <Rows>
                    <Row title="Log file" description={<ValueText>{payload.logFile}</ValueText>}>
                      <Button variant="outline" onClick={() => void window.metis.showLog()}>
                        Show
                      </Button>
                    </Row>
                  </Rows>
                </Panel>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

mount(<SettingsWindow />);

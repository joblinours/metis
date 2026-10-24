import { Button } from "@metis/ui/components/button";
import { ButtonGroup } from "@metis/ui/components/button-group";
import { Checkbox } from "@metis/ui/components/checkbox";
import { Input } from "@metis/ui/components/input";
import { Label } from "@metis/ui/components/label";
import { Switch } from "@metis/ui/components/switch";
import { cn } from "@metis/ui/lib/utils";
import {
  Download,
  Info,
  type LucideIcon,
  Search,
  Server,
  SlidersHorizontal,
  SpellCheck,
  Wrench,
} from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import type {
  DownloadMode,
  SettingsPayload,
  Settings as SettingsValues,
} from "../../../src/settings-types";
import { mount } from "../mount";

const SECTION_KEY = "metis-settings-section";
const LANGUAGE_LIMIT = 10;

type SectionId = "general" | "server" | "downloads" | "spelling" | "advanced" | "about";

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "server", label: "Server", icon: Server },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "spelling", label: "Spelling", icon: SpellCheck },
  { id: "advanced", label: "Advanced", icon: Wrench },
  { id: "about", label: "About", icon: Info },
];

const DOWNLOAD_MODES: { mode: DownloadMode; label: string }[] = [
  { mode: "ask", label: "Ask where to save" },
  { mode: "folder", label: "Save to a folder" },
];

function readSection(): SectionId | null {
  try {
    const stored = window.localStorage.getItem(SECTION_KEY);
    return SECTIONS.find((section) => section.id === stored)?.id ?? null;
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

function languageLabel(names: Intl.DisplayNames, code: string): string {
  try {
    return `${names.of(code) ?? code} (${code})`;
  } catch {
    return code;
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

function Languages({
  available,
  selected,
  onChange,
}: {
  available: string[];
  selected: string[];
  onChange: (languages: string[]) => void;
}) {
  const [filter, setFilter] = useState("");
  const entries = useMemo(() => {
    const names = new Intl.DisplayNames(undefined, { type: "language" });
    return available
      .map((code) => ({ code, label: languageLabel(names, code) }))
      .toSorted((a, b) => a.label.localeCompare(b.label));
  }, [available]);
  const query = filter.trim().toLowerCase();
  const shown = entries.filter((entry) => !query || entry.label.toLowerCase().includes(query));
  const full = selected.length >= LANGUAGE_LIMIT;

  function toggle(code: string) {
    const next = selected.includes(code)
      ? selected.filter((entry) => entry !== code)
      : [...selected, code];
    if (next.length > LANGUAGE_LIMIT) return;
    onChange(next);
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-6">
        <span className="block text-sm font-medium">Languages</span>
        <span className="text-xs text-muted-foreground">
          {selected.length} of {LANGUAGE_LIMIT} selected
        </span>
      </div>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Filter languages"
          aria-label="Filter languages"
          className="pl-8"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border py-1">
        {shown.map(({ code, label }) => {
          const checked = selected.includes(code);
          const id = `language-${code}`;
          return (
            <div key={code} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted">
              <Checkbox
                id={id}
                checked={checked}
                disabled={full && !checked}
                onCheckedChange={() => toggle(code)}
              />
              <Label htmlFor={id} className="truncate text-sm font-normal">
                {label}
              </Label>
            </div>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p className="px-1 pt-2 text-xs text-muted-foreground">No languages match.</p>
      ) : null}
    </div>
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

function SettingsWindow() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [section, setSection] = useState<SectionId>(() => readSection() ?? "general");
  const [cacheStatus, setCacheStatus] = useState("Keeps you signed in.");

  useEffect(() => {
    void window.metis.getSettings().then(setPayload);
  }, []);

  const hidden = new Set<SectionId>(payload?.platform === "darwin" ? ["spelling"] : []);
  const current = hidden.has(section) ? "general" : section;

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
          {SECTIONS.filter((entry) => !hidden.has(entry.id)).map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              aria-current={current === id ? "page" : undefined}
              className={cn(
                "w-full justify-start gap-2.5 text-muted-foreground",
                current === id && "bg-muted font-medium text-foreground",
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
              {current === "general" ? (
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
                  </Rows>
                </Panel>
              ) : null}

              {current === "server" ? (
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

              {current === "downloads" ? (
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

              {current === "spelling" ? (
                <Panel title="Spelling" description="Spell checking in everything you type.">
                  <Rows>
                    <SwitchRow
                      id="spellcheck"
                      title="Check spelling while typing"
                      checked={settings.spellcheck}
                      onChange={update}
                    />
                    {settings.spellcheck ? (
                      <Languages
                        available={payload.spellcheckLanguages}
                        selected={settings.spellcheckLanguages}
                        onChange={(languages) => void update({ spellcheckLanguages: languages })}
                      />
                    ) : null}
                  </Rows>
                </Panel>
              ) : null}

              {current === "advanced" ? (
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

              {current === "about" ? (
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

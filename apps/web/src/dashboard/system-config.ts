import "server-only";
import { ORPCError } from "@orpc/server";

import { config } from "@/config";
import { formatConfigError } from "@/config/format-error";
import { type InstanceConfigRow, instanceConfigToRow, rowToInstanceConfig } from "@/config/row";
import { getConfigVersion, getInstanceConfig, loadInstanceConfig } from "@/config/runtime";
import { type InstanceConfig, type InstanceSection, instanceConfigSchema } from "@/config/schema";
import {
  formatIssues,
  hashSection,
  INSTANCE_SECTIONS,
  instanceConfigWarnings,
  validateInstanceConfig,
} from "@/config/sections";
import { seedInstanceConfig } from "@/config/seed";
import {
  ConfigVersionConflictError,
  insertConfigVersion,
  listConfigVersions,
  readConfigRow,
  readCurrentConfigRow,
} from "@/config/store";
import { reconcileQuarantine } from "@/connections/quarantine";
import type {
  DashboardConfigDiff,
  DashboardConfigForm,
  DashboardConfigHistory,
  DashboardConfigSave,
  DashboardConfigSectionState,
  DashboardConfigState,
  DashboardConfigUpdateInput,
} from "@/server/schema";
import { CONFIG_SECTION_LABELS } from "@/types/instance-config";

import { diffSection, sectionForm, sectionFromForm } from "./config-forms";
import { checkFailed, verifySections } from "./system-checks";

const CONNECTION_SECTIONS = new Set<InstanceSection>([
  "google",
  "microsoft",
  "zoho",
  "imapServers",
  "caldavServers",
  "cloudflareServers",
  "resendServers",
  "s3Servers",
  "webdavServers",
  "ftpServers",
  "sftpServers",
]);

function sectionState(section: InstanceSection): DashboardConfigSectionState {
  return { section, label: CONFIG_SECTION_LABELS[section] };
}

export function configState(sections: InstanceSection[]): DashboardConfigState {
  return {
    version: getConfigVersion(),
    sections: sections.map(sectionState),
  };
}

export function configWarnings(): string[] {
  return instanceConfigWarnings(getInstanceConfig());
}

export function configForm(section: InstanceSection): DashboardConfigForm {
  return {
    state: sectionState(section),
    version: getConfigVersion(),
    ...sectionForm(section, getInstanceConfig()),
  };
}

function conflict(currentVersion: number | null): ORPCError<"CONFLICT", unknown> {
  return new ORPCError("CONFLICT", {
    message: `The configuration changed since you opened it${currentVersion ? ` (it is now version ${currentVersion})` : ""}. Reload and try again.`,
    data: { currentVersion },
  });
}

async function currentRow(expectedVersion: number): Promise<InstanceConfigRow> {
  const row = await readCurrentConfigRow();
  if (row) {
    if (row.version !== expectedVersion) throw conflict(row.version);
    return row;
  }
  if (expectedVersion !== 0) throw conflict(null);
  await seedInstanceConfig();
  const seeded = await readCurrentConfigRow();
  if (!seeded) throw new Error("Seeding the instance configuration failed");
  return seeded;
}

function refuseInvalid(candidate: InstanceConfig): void {
  const issues = validateInstanceConfig(config, candidate);
  if (issues.length > 0) {
    throw new ORPCError("BAD_REQUEST", { message: formatIssues(issues) });
  }
}

async function store(args: {
  row: InstanceConfigRow;
  candidate: InstanceConfig;
  changed: InstanceSection[];
  kind: "edit" | "revert";
  revertedFromVersion?: number;
  userId: string;
}): Promise<number> {
  let version: number;
  try {
    version = await insertConfigVersion({
      expectedVersion: args.row.version,
      settings: instanceConfigToRow(args.candidate),
      changedKeys: args.changed,
      kind: args.kind,
      revertedFromVersion: args.revertedFromVersion ?? null,
      createdByUserId: args.userId,
    });
  } catch (err) {
    if (err instanceof ConfigVersionConflictError) {
      throw conflict(err.currentVersion);
    }
    throw err;
  }
  console.log(`[config] ${args.kind} stored version=${version} changed=${args.changed.join(",")}`);
  await loadInstanceConfig();
  if (args.changed.some((section) => CONNECTION_SECTIONS.has(section))) {
    const result = await reconcileQuarantine(getInstanceConfig());
    console.log(
      `[config] quarantine version=${version} quarantined=${result.quarantined} restored=${result.restored} unavailable=${result.unavailable}`,
    );
  }
  return version;
}

export async function saveConfigSections(
  input: DashboardConfigUpdateInput,
  userId: string,
): Promise<DashboardConfigSave> {
  const row = await currentRow(input.expectedVersion);
  const stored = rowToInstanceConfig(row);

  const candidate = { ...stored };
  for (const edit of input.sections) {
    const parsed = instanceConfigSchema.shape[edit.section].safeParse(
      sectionFromForm(edit.section, edit, stored),
    );
    if (!parsed.success) {
      throw new ORPCError("BAD_REQUEST", {
        message: `${CONFIG_SECTION_LABELS[edit.section]}: ${formatConfigError(parsed.error)}`,
      });
    }
    Object.assign(candidate, { [edit.section]: parsed.data });
  }

  const warnings = instanceConfigWarnings(candidate);
  const changed = INSTANCE_SECTIONS.filter(
    (section) => hashSection(candidate[section]) !== hashSection(stored[section]),
  );
  if (changed.length === 0) {
    return { saved: false, version: row.version, check: null, warnings };
  }
  refuseInvalid(candidate);

  const check = await verifySections(changed, candidate);
  if (checkFailed(check)) {
    return { saved: false, version: row.version, check, warnings };
  }

  const version = await store({
    row,
    candidate,
    changed,
    kind: "edit",
    userId,
  });
  return { saved: true, version, check, warnings };
}

export async function revertConfig(
  input: { version: number; expectedVersion: number },
  userId: string,
): Promise<DashboardConfigSave> {
  const row = await currentRow(input.expectedVersion);
  const target = await readConfigRow(input.version);
  if (!target) {
    throw new ORPCError("NOT_FOUND", { message: "No such version" });
  }

  const stored = rowToInstanceConfig(row);
  const restored = rowToInstanceConfig(target);
  const changed = INSTANCE_SECTIONS.filter(
    (section) => hashSection(stored[section]) !== hashSection(restored[section]),
  );
  const warnings = instanceConfigWarnings(restored);
  if (changed.length === 0) {
    return { saved: false, version: row.version, check: null, warnings };
  }
  refuseInvalid(restored);

  const check = await verifySections(changed, restored);
  if (checkFailed(check)) {
    return { saved: false, version: row.version, check, warnings };
  }

  const version = await store({
    row,
    candidate: restored,
    changed,
    kind: "revert",
    revertedFromVersion: target.version,
    userId,
  });
  return { saved: true, version, check, warnings };
}

export async function configHistory(): Promise<DashboardConfigHistory> {
  const versions = await listConfigVersions();
  return {
    current: versions.find((entry) => entry.isCurrent)?.version ?? 0,
    versions: versions.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export async function configDiff(from: number, to: number): Promise<DashboardConfigDiff> {
  const [before, after] = await Promise.all([readConfigRow(from), readConfigRow(to)]);
  if (!before || !after) {
    throw new ORPCError("NOT_FOUND", { message: "No such version" });
  }
  const a = rowToInstanceConfig(before);
  const b = rowToInstanceConfig(after);
  return {
    from,
    to,
    sections: INSTANCE_SECTIONS.map((section) => diffSection(section, a, b)).filter(
      (entry) => entry.changes.length > 0,
    ),
  };
}

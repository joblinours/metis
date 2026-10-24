import type { Page } from "@playwright/test";

import { enterCode } from "../auth";
import { expect, type Rpc, RpcError, test } from "../fixtures";
import { harness } from "../harness";
import { updater } from "../updater";

const UPGRADE_TIMEOUT = 30_000;

function main(page: Page) {
  return page.getByRole("main");
}

function section(page: Page, title: string) {
  return main(page)
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function toasts(page: Page) {
  return page.getByRole("region", { name: /^Notifications/ });
}

function releaseRow(page: Page, version: string) {
  return section(page, "Releases").getByText(version, { exact: true }).locator("..");
}

async function runningVersion(page: Page, version: string) {
  await expect(section(page, "Running release").getByText(version, { exact: true })).toBeVisible({
    timeout: UPGRADE_TIMEOUT,
  });
}

async function openUpdates(page: Page) {
  await page.goto("/dashboard/system");
  await page
    .getByRole("complementary", { name: "Dashboard" })
    .getByRole("link", { name: "Updates", exact: true })
    .click();
  await expect(main(page).getByRole("heading", { level: 1, name: "Updates" })).toBeVisible();
}

async function confirmTotp(page: Page, title: string, action: string) {
  const dialog = page.getByRole("alertdialog", { name: title });
  await expect(dialog).toBeVisible();
  await enterCode(page, await harness.totp());
  await dialog.getByRole("button", { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function upgradeTo(page: Page, version: string, verb: string) {
  await releaseRow(page, version).getByRole("button", { name: verb, exact: true }).click();
  await confirmTotp(page, `${verb} to ${version}`, verb);
}

async function expectRpcError(call: Promise<unknown>, code: string, message: string) {
  const error = await call.then(
    () => null,
    (err: unknown) => err,
  );
  if (!(error instanceof RpcError)) {
    throw new Error(`expected an RpcError, got ${String(error)}`);
  }
  expect(error.code).toBe(code);
  expect(error.message).toBe(message);
}

async function upgrade(rpc: Rpc, version: string) {
  return rpc("dashboard.system.upgrade", {
    version,
    code: await harness.totp(),
  });
}

export default function updateSpecs() {
  test.beforeEach(async () => {
    await updater.reset();
  });

  test.afterAll(async () => {
    await updater.reset();
  });

  test("upgrading to a newer release shows its progress, then runs that release with the old one as the rollback", async ({
    page,
  }) => {
    await openUpdates(page);
    await runningVersion(page, "1.1.0");
    await expect(section(page, "Running release")).toContainText("Update available");
    await expect(releaseRow(page, "1.1.0").getByRole("button")).toHaveCount(0);

    await upgradeTo(page, "1.2.0", "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText("1.1.0 → 1.2.0");
    await expect(last).toContainText("Running");
    await expect(last).toContainText("Pull the release");

    await expect(last).toContainText("Succeeded", { timeout: UPGRADE_TIMEOUT });
    await expect(toasts(page).getByText("Now running 1.2.0", { exact: true })).toBeVisible();
    await page.reload();
    await runningVersion(page, "1.2.0");
    await expect(section(page, "Running release")).toContainText("Up to date");
    await expect(
      section(page, "Running release").getByRole("button", {
        name: "Roll back to 1.1.0",
      }),
    ).toBeVisible();
    expect((await updater.state()).settings.current).toBe("1.2.0");
  });

  test("downgrading to an older release runs that release", async ({ page }) => {
    await openUpdates(page);
    await upgradeTo(page, "1.0.0", "Downgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText("1.1.0 → 1.0.0");
    await expect(last).toContainText("Succeeded", { timeout: UPGRADE_TIMEOUT });
    await page.reload();
    await runningVersion(page, "1.0.0");
    await expect(
      section(page, "Running release").getByRole("button", {
        name: "Roll back to 1.1.0",
      }),
    ).toBeVisible();
    await expect(releaseRow(page, "1.2.0").getByRole("button", { name: "Upgrade" })).toBeVisible();
    expect((await updater.state()).settings.current).toBe("1.0.0");
  });

  test("rolling back returns to the previous release", async ({ page }) => {
    await openUpdates(page);
    await section(page, "Running release")
      .getByRole("button", { name: "Roll back to 1.0.0" })
      .click();
    await confirmTotp(page, "Roll back to 1.0.0", "Roll back");
    const last = section(page, "Last rollback");
    await expect(last).toContainText("1.1.0 → 1.0.0");
    await expect(last).toContainText("Succeeded", { timeout: UPGRADE_TIMEOUT });
    await page.reload();
    await runningVersion(page, "1.0.0");
    await expect(
      section(page, "Running release").getByRole("button", {
        name: "Roll back to 1.1.0",
      }),
    ).toBeVisible();
  });

  test("a release whose preflight fails is never installed and the running release stays", async ({
    page,
  }) => {
    await updater.reset({ outcome: "preflight-fails" });
    await openUpdates(page);
    await upgradeTo(page, "1.2.0", "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText("Failed", { timeout: UPGRADE_TIMEOUT });
    await expect(last).toContainText("1.2.0 was not installed; 1.1.0 kept running.");
    await expect(last).toContainText("preflight failed: exit status 1");
    await expect(toasts(page).getByText("The upgrade failed", { exact: true })).toBeVisible();
    await runningVersion(page, "1.1.0");
  });

  test("a release that never becomes ready is switched back", async ({ page }) => {
    await updater.reset({ outcome: "never-ready" });
    await openUpdates(page);
    await upgradeTo(page, "1.2.0", "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText("Failed", { timeout: UPGRADE_TIMEOUT });
    await expect(last).toContainText(
      "1.2.0 did not come up, so the updater switched back to 1.1.0.",
    );
    await expect(last).toContainText("was not ready within");
    await runningVersion(page, "1.1.0");
  });

  test("a failed switch back is shown as needing attention", async ({ page }) => {
    await updater.reset({ outcome: "restore-fails" });
    await openUpdates(page);
    await upgradeTo(page, "1.2.0", "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText("Needs attention", {
      timeout: UPGRADE_TIMEOUT,
    });
    await expect(last).toContainText("Switching back to 1.1.0 failed too.");
    await expect(last).toContainText("restoring 1.1.0 also failed");
  });

  test("the updater's refusals reach the caller as oRPC errors", async ({ page, rpc }) => {
    await expectRpcError(
      rpc("dashboard.system.upgrade", {
        version: "latest",
        code: await harness.totp(),
      }),
      "BAD_REQUEST",
      "Input validation failed",
    );
    await expectRpcError(upgrade(rpc, "1.1.0"), "CONFLICT", "1.1.0 is already running");
    await expectRpcError(upgrade(rpc, "9.9.9"), "BAD_REQUEST", "9.9.9 is not a published release");

    await updater.reset({ rollback: "" });
    await expectRpcError(
      rpc("dashboard.system.rollback", { code: await harness.totp() }),
      "CONFLICT",
      "there is no previous release to roll back to",
    );

    await updater.reset();
    await updater.hold();
    await expectRpcError(
      upgrade(rpc, "1.2.0"),
      "CONFLICT",
      "an upgrade or rollback is already running",
    );

    await openUpdates(page);
    await expect(section(page, "Last upgrade")).toContainText("Running");
    await expect(releaseRow(page, "1.2.0").getByRole("button", { name: "Upgrade" })).toBeDisabled();
    await expect(
      section(page, "Running release").getByRole("button", {
        name: "Roll back to 1.0.0",
      }),
    ).toBeDisabled();
  });

  test("an updater that stops answering is shown as unreachable", async ({ page, rpc }) => {
    await updater.down();
    try {
      const status = await rpc<{ reachable: boolean; error: string | null }>(
        "dashboard.system.updates",
      );
      expect(status.reachable).toBe(false);
      expect(status.error).toBeTruthy();

      await openUpdates(page);
      const card = section(page, "The updater is not answering");
      await expect(card).toBeVisible();
      await expect(card).toContainText("Unreachable");
    } finally {
      await updater.up();
    }
    await page.reload();
    await runningVersion(page, "1.1.0");
  });
}

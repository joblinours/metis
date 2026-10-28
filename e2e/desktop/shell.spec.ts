import { expect, test } from "@playwright/test";

import { APP, HARNESS, harness } from "../clients/harness";
import { launchShell, pairServer, type Shell, signInThroughBrowser } from "./shell";

let shell: Shell;

test.beforeEach(async () => {
  shell = await launchShell();
});

test.afterEach(async () => {
  await shell.close();
});

test("setup rejects an address with no Metis server and accepts the harness", async () => {
  const window = shell.window;
  await pairServer(shell, HARNESS);
  await expect(window.getByText(`No Metis server answered at ${HARNESS}.`)).toBeVisible();

  await pairServer(shell, APP);
  await expect(window.getByRole("button", { name: "Sign in with browser" })).toBeVisible();
  await expect(window.getByText(APP)).toBeVisible();
});

test("signs in through the browser and opens the workspace", async () => {
  await pairServer(shell, APP);
  await signInThroughBrowser(shell);
  await expect(shell.window).toHaveURL(new RegExp(`^${APP}/w(/|$)`));
  await expect(shell.window.getByRole("navigation", { name: "App navigation" })).toBeVisible();
});

test("the App settings item opens the Settings window", async () => {
  await pairServer(shell, APP);
  await signInThroughBrowser(shell);
  const window = shell.window;
  await expect(window.getByRole("navigation", { name: "App navigation" })).toBeVisible();

  const account = await harness.account();
  const opened = shell.app.waitForEvent("window");
  await window.getByRole("button", { name: account.name }).click();
  await window.getByRole("menuitem", { name: "App settings" }).click({ noWaitAfter: true });
  const settings = await opened;
  await expect(settings).toHaveTitle("Settings");
  await expect(settings.getByRole("heading", { name: "General" })).toBeVisible();
  const urls = await shell.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((each) => each.webContents.getURL()),
  );
  expect(urls).toContainEqual(expect.stringMatching(new RegExp(`^${APP}/w(/|$)`)));
});

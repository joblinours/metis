import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { workspacePath } from "../harness";

const REBRAND = "Label rebrand mail";
const NEWSLETTER = "Morning newsletter sweep";

function sidebar(page: Page) {
  return page.getByRole("complementary").filter({
    has: page.getByRole("button", { name: "New workflow", exact: true }),
  });
}

function canvas(page: Page) {
  return page.getByRole("application");
}

function step(page: Page, name: string) {
  return canvas(page).getByRole("group", { name, exact: true });
}

function inspector(page: Page) {
  return page.getByRole("region", { name: "Inspector" });
}

async function fromTemplate(page: Page, template: string) {
  await sidebar(page).getByRole("button", { name: "New workflow", exact: true }).click();
  await page
    .getByRole("menu", { name: "New workflow" })
    .getByRole("menuitem", { name: template, exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Create workflow", exact: true })).toBeVisible();
}

async function openSeeded(page: Page, name: string) {
  await sidebar(page)
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await expect(page.getByRole("textbox", { name: "Workflow name" })).toHaveValue(name);
}

test.beforeEach(async ({ page, account }) => {
  await page.goto(workspacePath(account, "/workflow"));
  await expect(canvas(page)).toBeVisible();
});

test("the palette groups steps by category and filters them by search", async ({ page }) => {
  const palette = page.getByRole("listbox");
  for (const heading of ["Triggers", "Mail", "Logic", "Actions"]) {
    await expect(palette.getByText(heading, { exact: true })).toBeVisible();
  }
  const option = (name: string) =>
    page.getByRole("option").filter({ has: page.getByText(name, { exact: true }) });
  await expect(option("Archive")).toBeVisible();
  await page.getByPlaceholder("Search steps").fill("label");
  await expect(option("Apply label")).toBeVisible();
  await expect(option("Archive")).toHaveCount(0);
});

test("a template's cards summarize their settings and flag a missing condition value live", async ({
  page,
  account,
}) => {
  await fromTemplate(page, "One mailbox, on arrival");
  await expect(step(page, "When mail arrives")).toContainText(`Watching ${account.email}`);
  await expect(step(page, "Mailbox")).toContainText("Newly arrived mail");
  await expect(step(page, "If")).toContainText("Fill in the value of every condition");

  const problems = page.getByRole("button", { name: "1 problem", exact: true });
  await expect(problems).toBeVisible();
  await problems.click();
  await expect(inspector(page).getByRole("heading", { name: "If", exact: true })).toBeVisible();

  await inspector(page).getByRole("textbox", { name: "Value" }).fill("raj@");
  await expect(problems).toHaveCount(0);
  await expect(step(page, "If")).toContainText("Sender contains “raj@”");
  await expect(step(page, "If")).not.toContainText("Fill in the value");
});

test("clicking a palette step adds it to the canvas, and Delete removes it", async ({ page }) => {
  await fromTemplate(page, "One mailbox, on arrival");
  const before = await canvas(page).getByRole("group").count();
  await page
    .getByRole("option")
    .filter({ has: page.getByText("Star", { exact: true }) })
    .click();
  await expect(step(page, "Star")).toBeVisible();
  await expect(canvas(page).getByRole("group")).toHaveCount(before + 1);
  await expect(inspector(page).getByRole("heading", { name: "Star", exact: true })).toBeVisible();

  await inspector(page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(step(page, "Star")).toHaveCount(0);
  await expect(canvas(page).getByRole("group")).toHaveCount(before);
});

test("undo and redo step back and forth over a step's new name", async ({ page }) => {
  await fromTemplate(page, "One mailbox, on arrival");
  await step(page, "If").click();
  const name = inspector(page).getByRole("textbox", { name: "Name", exact: true });
  await name.fill("Mail from Raj");
  await name.press("Tab");
  await expect(step(page, "Mail from Raj")).toBeVisible();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(step(page, "If")).toBeVisible();
  await expect(step(page, "Mail from Raj")).toHaveCount(0);

  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(step(page, "Mail from Raj")).toBeVisible();
});

test("the w a chord opens quick add, and the picked step lands on the canvas", async ({ page }) => {
  await fromTemplate(page, "One mailbox, on arrival");
  await page.keyboard.press("w");
  await page.keyboard.press("a");
  const dialog = page.getByRole("dialog", { name: "Add step" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("Mark as read");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(step(page, "Mark as read")).toBeVisible();
});

test("the schedule picker edits the schedule and lists its next runs", async ({ page }) => {
  await fromTemplate(page, "Two mailboxes, on a schedule");
  const schedule = step(page, "On a schedule");
  await expect(schedule).toContainText("Weekdays at 09:00");
  await schedule.click();

  const repeats = inspector(page).getByRole("combobox", { name: "Repeats" });
  await expect(repeats).toContainText("Every weekday");
  await expect(
    inspector(page).getByText("Next runs").locator("xpath=..").getByRole("listitem"),
  ).toHaveCount(3);

  await repeats.click();
  await page.getByRole("option", { name: "Every day", exact: true }).click();
  await expect(schedule).toContainText("Every day at 09:00");

  await repeats.click();
  await page.getByRole("option", { name: "Custom (cron)", exact: true }).click();
  await inspector(page).getByRole("textbox", { name: "Cron expression" }).fill("not a cron");
  await expect(schedule).toContainText("Use a five-field cron expression");
  await expect(inspector(page).getByText("This schedule never fires as written.")).toBeVisible();
});

test("skipping an action marks its card as skipped", async ({ page }) => {
  await fromTemplate(page, "One mailbox, on arrival");
  await step(page, "Archive").click();
  await inspector(page).getByRole("switch", { name: "Skip this step" }).click();
  await expect(step(page, "Archive")).toContainText("Skipped");
});

test("leaving a workflow with unsaved changes asks first", async ({ page }) => {
  await openSeeded(page, REBRAND);
  const name = page.getByRole("textbox", { name: "Workflow name" });
  await name.fill(`${REBRAND} (edited)`);
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();

  const leave = () =>
    sidebar(page)
      .getByRole("button")
      .filter({ has: page.getByText(NEWSLETTER, { exact: true }) })
      .click();
  const confirm = page.getByRole("alertdialog", { name: "Discard unsaved changes?" });

  await leave();
  await confirm.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(name).toHaveValue(`${REBRAND} (edited)`);

  await leave();
  await confirm.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(name).toHaveValue(NEWSLETTER);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});

test("a test run of a seeded workflow shows each step's result and changes nothing", async ({
  page,
}) => {
  await openSeeded(page, REBRAND);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Test run" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Run test", exact: true }).click();

  const result = page.getByRole("region", { name: "Test result" });
  await expect(result).toContainText("completed");
  await expect(page.getByText("Showing the test run on the canvas")).toBeVisible();

  await step(page, "Apply label").click();
  const ran = inspector(page).getByRole("region", { name: "In the test run" });
  await expect(ran).toContainText("Rebrand kickoff");
  await expect(ran).toContainText("not applied in a test run");
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(0);
});

test("the runs dock lists the seeded run and draws it on the canvas", async ({ page }) => {
  await openSeeded(page, REBRAND);
  await page.getByRole("tab", { name: "Runs" }).click();
  const completed = page
    .getByRole("list", { name: "Recent runs" })
    .getByRole("button")
    .filter({ hasText: "completed" })
    .first();
  await expect(completed).toBeVisible();
  await completed.click();
  await expect(page.getByText(/^Showing run \w{8} on the canvas$/)).toBeVisible();
  await expect(page.getByText("Showing a run on the canvas")).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "If (Yes) to Apply label" })
      .locator("path.react-flow__edge-path"),
  ).toHaveCSS("stroke-dasharray", "none");
});

test("the keyboard shortcuts dialog lists the workflow keys", async ({ page }) => {
  await page.getByRole("button", { name: "More workflow actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  const help = page.getByRole("dialog");
  await expect(help.getByText("Add step", { exact: true })).toBeVisible();
  await expect(help.getByText("Tidy up the layout", { exact: true })).toBeVisible();
  await expect(help.getByText("Save", { exact: true })).toBeVisible();
  await expect(help.getByText("Duplicate the selected steps", { exact: true })).toBeVisible();
});

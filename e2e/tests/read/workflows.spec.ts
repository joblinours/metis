import { LATE_ARRIVAL_WORKFLOW } from "@metis/e2e/lib/late-arrival";

import { expect, test } from "../fixtures";
import { workspacePath } from "../harness";

const SEEDED = [
  "Label rebrand mail",
  "Morning newsletter sweep",
  "File new mail from Raj",
  "Collect rebrand and GitHub mail",
  "Label orders once both checks finish",
  "Triage with the decision model",
  LATE_ARRIVAL_WORKFLOW,
];
const REBRAND_SUBJECTS = [
  "Rebrand kickoff",
  "Invitation: Rebrand review @ Thu Oct 8, 2026 15:00 UTC",
];
const NEW_MAIL = ["File new mail from Raj", LATE_ARRIVAL_WORKFLOW];
const RUN_ONCE = SEEDED.filter((name) => !NEW_MAIL.includes(name));

function sidebarPanel(page: import("@playwright/test").Page) {
  return page.getByRole("complementary").filter({
    has: page.getByRole("button", { name: "New workflow", exact: true }),
  });
}

function sidebar(page: import("@playwright/test").Page) {
  return sidebarPanel(page).getByRole("list");
}

test("the seeded workflows are listed", async ({ page, account }) => {
  await page.goto(workspacePath(account, "/workflow"));
  for (const name of SEEDED) {
    await expect(
      sidebar(page)
        .getByRole("button")
        .filter({ has: page.getByText(name, { exact: true }) }),
    ).toBeVisible();
  }
  await expect(
    sidebar(page).getByRole("button", {
      name: `${LATE_ARRIVAL_WORKFLOW} off`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(sidebar(page).getByRole("listitem")).toHaveCount(SEEDED.length);
});

test("the seeded history has one run per manual and schedule workflow, with taken edges and item outputs", async ({
  page,
  rpc,
  account,
}) => {
  const scope = { workspaceSlug: account.workspaceSlug };
  const { runs } = await rpc<{
    runs: { id: string; workflowName: string }[];
  }>("workflows.runs", { ...scope, limit: 100 });
  const sources = await Promise.all(
    runs.map(async (run) => {
      const detail = await rpc<{ run: { trigger: { source: string } } }>("workflows.getRun", {
        ...scope,
        runId: run.id,
      });
      return { name: run.workflowName, source: detail.run.trigger.source };
    }),
  );
  const seeded = (name: string) =>
    sources.filter((run) => run.name === name && run.source === "manual");
  for (const name of RUN_ONCE) expect(seeded(name), name).toHaveLength(1);
  for (const name of NEW_MAIL) {
    expect(
      runs.filter((run) => run.workflowName === name),
      name,
    ).toHaveLength(0);
  }

  await page.goto(workspacePath(account, "/workflow/history"));
  await expect(page.getByRole("heading", { level: 1, name: "Workflow activity" })).toBeVisible();
  const runLink = (name: string) =>
    page
      .getByRole("listitem")
      .getByRole("link")
      .filter({ has: page.getByText(name, { exact: true }) });
  for (const name of RUN_ONCE) await expect(runLink(name).first()).toBeVisible();
  for (const name of NEW_MAIL) await expect(runLink(name)).toHaveCount(0);

  await runLink("Label rebrand mail").click();
  await expect(page.getByRole("heading", { level: 1, name: "Label rebrand mail" })).toBeVisible();
  const taken = page
    .getByRole("img", { name: "If (Yes) to Apply label" })
    .locator("path.react-flow__edge-path");
  await expect(taken).toHaveCSS("stroke-dasharray", "none");

  await page.getByRole("group", { name: /^Apply label: / }).click();
  const step = page.getByRole("region", { name: "Selected step" });
  await expect(
    step.getByText(`completed ×${REBRAND_SUBJECTS.length} · ${account.email}`, {
      exact: true,
    }),
  ).toBeVisible();
  const items = step.getByRole("listitem");
  await expect(items).toHaveCount(REBRAND_SUBJECTS.length);
  for (const item of await items.all()) {
    await expect(item.getByText(`completed · ${account.email}`, { exact: true })).toBeVisible();
  }
  for (const subject of REBRAND_SUBJECTS) {
    await expect(items.filter({ hasText: subject })).toHaveCount(1);
  }
});

test("a bad graph shows its validation error and is not saved", async ({ page, account }) => {
  const creates: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/rpc/workflows/create") creates.push(req.url());
  });
  await page.goto(workspacePath(account, "/workflow"));
  await sidebarPanel(page).getByRole("button", { name: "New workflow", exact: true }).click();
  await page
    .getByRole("menu", { name: "New workflow" })
    .getByRole("menuitem", { name: "One mailbox, on arrival", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Workflow name" }).fill("Invalid on purpose");
  const trigger = page
    .getByRole("application")
    .getByRole("group")
    .filter({ has: page.getByText("When mail arrives", { exact: true }) });
  await trigger.getByRole("button", { name: "Remove step" }).click();
  await expect(trigger).toHaveCount(0);
  await page.getByRole("button", { name: "Create workflow", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Inspector" }).getByText("Start the workflow with a trigger"),
  ).toBeVisible();
  expect(creates).toEqual([]);
  await page.reload();
  await expect(sidebar(page).getByRole("listitem")).toHaveCount(SEEDED.length);
  await expect(sidebar(page).getByRole("button", { name: "Invalid on purpose" })).toHaveCount(0);
});

test("the step palette offers Ask and Branch", async ({ page, account }) => {
  await page.goto(workspacePath(account, "/workflow"));
  const step = (name: string) =>
    page.getByRole("option").filter({ has: page.getByText(name, { exact: true }) });
  await expect(step("Ask")).toBeVisible();
  await expect(step("Branch")).toBeVisible();
});

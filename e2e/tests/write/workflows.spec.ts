import { expect, test, uniqueName } from "../fixtures";
import { workspacePath } from "../harness";
import {
  labelMap,
  nodeOf,
  restoreLabels,
  runWorkflow,
  workflowNamed,
  workspace,
} from "../workflow";

export default function workflowSpecs() {
  test("build, save, toggle and delete a workflow", async ({ page, rpc, account }, testInfo) => {
    const name = uniqueName(testInfo);
    const list = page.getByRole("complementary").filter({
      has: page.getByRole("button", { name: "New workflow", exact: true }),
    });
    const canvas = page.getByRole("application");
    const inspector = page.getByRole("region", { name: "Inspector" });
    const workflowName = page.getByRole("textbox", { name: "Workflow name" });
    await page.goto(workspacePath(account, "/workflow"));
    await list.getByRole("button", { name: "New workflow", exact: true }).click();
    await page
      .getByRole("menu", { name: "New workflow" })
      .getByRole("menuitem", { name: "One mailbox, on arrival", exact: true })
      .click();
    try {
      await workflowName.fill(name);
      await canvas.getByRole("group", { name: "If", exact: true }).click();
      await inspector.getByRole("textbox", { name: "Value" }).fill("nobody@discard.harness.test");
      await page.getByRole("button", { name: "Create workflow", exact: true }).click();
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
      await expect(workflowName).toHaveValue(name);
      await expect(list.getByRole("button", { name, exact: true })).toBeVisible();
      expect((await workflowNamed(rpc, account, name)).enabled).toBe(true);

      await page.getByRole("switch", { name: "Enabled", exact: true }).click();
      await expect(page.getByText("Disabled", { exact: true })).toBeVisible();
      await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      await expect.poll(async () => (await workflowNamed(rpc, account, name)).enabled).toBe(false);

      await page.getByRole("button", { name: "More workflow actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Delete workflow", exact: true }).click();
      await page
        .getByRole("alertdialog", { name: "Delete this workflow?" })
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await expect(
        list.getByRole("button").filter({ has: page.getByText(name, { exact: true }) }),
      ).toHaveCount(0);
      await expect
        .poll(() =>
          workflowNamed(rpc, account, name).then(
            () => "listed",
            () => "gone",
          ),
        )
        .toBe("gone");
    } finally {
      const leftover = await workflowNamed(rpc, account, name).catch(() => null);
      if (leftover)
        await rpc("workflows.delete", {
          ...workspace(account),
          id: leftover.id,
        });
    }
  });

  test("Run now draws the run on the canvas, and a step's name and skip flag save", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const name = uniqueName(testInfo);
    const { mailboxes } = await rpc<{ mailboxes: { mailboxId: string; slug: string }[] }>(
      "workflows.list",
      workspace(account),
    );
    const mailboxId =
      mailboxes.find((m) => m.slug === account.mailboxSlug)?.mailboxId ??
      mailboxes[0]?.mailboxId ??
      "";
    const { workflow } = await rpc<{ workflow: { id: string } }>("workflows.create", {
      ...workspace(account),
      workflow: {
        name,
        enabled: true,
        graph: {
          nodes: [
            { id: "manual", kind: "trigger.manual", position: { x: 0, y: 0 } },
            {
              id: "inbox",
              kind: "mailbox.source",
              position: { x: 352, y: 0 },
              mailboxId,
              operation: "list",
              folder: "inbox",
              limit: 10,
            },
            {
              id: "none",
              kind: "condition",
              position: { x: 704, y: 0 },
              predicate: {
                kind: "predicate",
                field: "subject",
                op: "contains",
                value: "e2e-subject-that-matches-nothing",
              },
            },
            { id: "star", kind: "action.star", position: { x: 1056, y: 0 } },
          ],
          edges: [
            { id: "e1", source: "manual", sourceHandle: "out", target: "inbox" },
            { id: "e2", source: "inbox", sourceHandle: "out", target: "none" },
            { id: "e3", source: "none", sourceHandle: "matched", target: "star" },
          ],
        },
      },
    });
    try {
      await page.goto(workspacePath(account, `/workflow?id=${workflow.id}`));
      await expect(page.getByRole("textbox", { name: "Workflow name" })).toHaveValue(name);

      await page.getByRole("button", { name: "Run now", exact: true }).click();
      await expect(page.getByText(/^Showing run \w{8} on the canvas$/)).toBeVisible();
      await expect(
        page.getByRole("list", { name: "Recent runs" }).getByRole("button").first(),
      ).toContainText("completed", { timeout: 60_000 });

      const canvas = page.getByRole("application");
      const inspector = page.getByRole("region", { name: "Inspector" });
      await canvas.getByRole("group", { name: "Star", exact: true }).click();
      const title = inspector.getByRole("textbox", { name: "Name", exact: true });
      await title.fill("Star nothing");
      await title.press("Tab");
      await inspector.getByRole("switch", { name: "Skip this step" }).click();
      await expect(canvas.getByRole("group", { name: "Star nothing", exact: true })).toContainText(
        "Skipped",
      );
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();

      const saved = await workflowNamed(rpc, account, name);
      const star = saved.graph.nodes.find((n) => n.id === "star");
      expect(star?.title).toBe("Star nothing");
      expect(star?.skip).toBe(true);
    } finally {
      await rpc("workflows.delete", { ...workspace(account), id: workflow.id });
    }
  });

  test("run Label rebrand mail and the two merge workflows, and check their history", async ({
    page,
    rpc,
    account,
  }) => {
    const before = await labelMap(rpc, account);
    try {
      const rebrand = await runWorkflow(rpc, account, "Label rebrand mail");
      expect(rebrand.status).toBe("completed");
      expect(nodeOf(rebrand, "label").items.length).toBeGreaterThan(0);

      const append = await runWorkflow(rpc, account, "Collect rebrand and GitHub mail");
      expect(append.status).toBe("completed");
      const appended = nodeOf(append, "append").items.map((i) => i.id);
      expect(new Set(appended).size).toBe(appended.length);
      const fromBranches = new Set([
        ...nodeOf(append, "rebrand").items.map((i) => i.id),
        ...nodeOf(append, "github").items.map((i) => i.id),
      ]);
      expect(nodeOf(append, "label").items.length).toBeLessThanOrEqual(fromBranches.size);

      const join = await runWorkflow(rpc, account, "Label orders once both checks finish");
      expect(join.status).toBe("completed");
      const barriers = nodeOf(join, "join").items.filter((item) => item.inputs !== null);
      expect(barriers.length).toBeGreaterThan(0);
      for (const item of barriers) {
        expect(item.inputs?.map((i) => i.port).toSorted()).toEqual([0, 1]);
        for (const input of item.inputs ?? []) expect(input.state).toBe("settled");
      }
      expect(nodeOf(join, "label").reached).toBe(true);

      await page.goto(workspacePath(account, `/workflow/history/${append.id}`));
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Collect rebrand and GitHub mail",
        }),
      ).toBeVisible();
      await page.getByRole("group", { name: /^Combine: / }).click();
      const step = page.getByRole("region", { name: "Selected step" });
      await expect(step).toBeVisible();
      await expect(step.getByText("Combine", { exact: true })).toBeVisible();
    } finally {
      await restoreLabels(rpc, account, before);
    }
  });
}

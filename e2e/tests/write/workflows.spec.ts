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
    await page.goto(workspacePath(account, "/workflow"));
    await list.getByRole("button", { name: "New workflow", exact: true }).click();
    await page
      .getByRole("menu", { name: "New workflow" })
      .getByRole("menuitem", { name: "One mailbox, on arrival", exact: true })
      .click();
    try {
      await canvas.getByRole("textbox", { name: "Untitled workflow" }).fill(name);
      await canvas.getByRole("textbox", { name: "value" }).fill("nobody@discard.harness.test");
      await canvas.getByRole("button", { name: "Create workflow", exact: true }).click();
      await expect(canvas.getByRole("button", { name: "Save", exact: true })).toBeVisible();
      await expect(canvas.getByRole("textbox", { name: "Untitled workflow" })).toHaveValue(name);
      await expect(list.getByRole("button", { name, exact: true })).toBeVisible();
      expect((await workflowNamed(rpc, account, name)).enabled).toBe(true);

      await canvas.getByRole("button", { name: "Enabled", exact: true }).click();
      await expect(canvas.getByRole("button", { name: "Disabled", exact: true })).toBeVisible();
      await canvas.getByRole("button", { name: "Save", exact: true }).click();
      await expect(canvas.getByText("Saved", { exact: true })).toBeVisible();
      await expect.poll(async () => (await workflowNamed(rpc, account, name)).enabled).toBe(false);

      const remove = canvas.getByRole("button", { name: /^Delete/ });
      await expect(remove).toBeVisible();
      await remove.click();
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

import { expect, type Locator, type Page } from "@playwright/test";

export function files(page: Page): Locator {
  return page.getByRole("region", { name: "Files" });
}

export function entry(page: Page, name: string): Locator {
  return files(page)
    .getByRole("button")
    .and(page.getByTitle(name, { exact: true }));
}

export function entryActions(page: Page, name: string): Locator {
  return files(page).getByRole("button", {
    name: `Actions for ${name}`,
    exact: true,
  });
}

export function driveSidebar(page: Page): Locator {
  return page.getByRole("complementary").filter({
    has: page.getByRole("button", { name: "Switch drive" }),
  });
}

export function folderPath(drivePath: string, path: string): string {
  return `${drivePath}/${encodeURIComponent(path)}`;
}

export async function openPreview(page: Page, name: string): Promise<Locator> {
  await entry(page, name).dblclick();
  const preview = page.getByRole("complementary", {
    name: `Preview of ${name}`,
  });
  await expect(preview).toBeVisible();
  return preview;
}

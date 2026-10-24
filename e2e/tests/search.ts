import { expect, type Locator, type Page } from "@playwright/test";

export function searchDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Search" });
}

export function searchBox(page: Page): Locator {
  return searchDialog(page).getByRole("searchbox", {
    name: "Search this workspace",
  });
}

export async function openSearch(page: Page): Promise<Locator> {
  await page
    .getByRole("navigation", { name: "App navigation" })
    .getByRole("button", { name: "Search", exact: true })
    .click();
  const dialog = searchDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function typeQuery(page: Page, text: string): Promise<void> {
  const box = searchBox(page);
  await box.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text);
  await expect(box).toHaveText(text);
}

export function result(page: Page, name: string | RegExp): Locator {
  return searchDialog(page).getByRole("option", { name });
}

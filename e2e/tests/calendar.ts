import { expect, type Locator, type Page } from "@playwright/test";

export const REVIEW_WEEK = new Date("2026-10-08T12:00:00Z");

export function toolbar(page: Page): Locator {
  return page.getByRole("banner");
}

export function calendars(page: Page): Locator {
  return page.getByRole("complementary", { name: "Calendars" });
}

export async function chooseView(page: Page, view: string): Promise<void> {
  await toolbar(page)
    .getByRole("button", { name: /^(Day|Week|Month|Year|Schedule)$/ })
    .click();
  await page.getByRole("menuitem", { name: new RegExp(`^${view}\\b`) }).click();
  await expect(toolbar(page).getByRole("button", { name: view, exact: true })).toBeVisible();
}

export function monthDay(page: Page, day: string): Locator {
  return page.locator(`div:has(> button[aria-label="New event on ${day}"])`);
}

export function timedEvent(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

export function calendarAgent(page: Page): Locator {
  return page.getByRole("group").filter({
    has: page.getByRole("textbox", { name: "Ask about your calendar…" }),
  });
}

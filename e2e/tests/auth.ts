import { expect, type Page } from "@playwright/test";

export async function enterCode(page: Page, code: string): Promise<void> {
  const input = page.locator('input[autocomplete="one-time-code"]');
  await input.click();
  await page.keyboard.type(code);
  await expect(input).toHaveValue(code);
}

export async function signIn(
  page: Page,
  credentials: { email: string; password: string },
  code: () => Promise<string>,
): Promise<void> {
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByRole("textbox", { name: "Email address" }).fill(credentials.email);
  await main.getByRole("textbox", { name: "Password" }).fill(credentials.password);
  await main.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/2fa\/verify/);
  await enterCode(page, await code());
  await main.getByRole("button", { name: "Verify", exact: true }).click();
  await page.waitForURL(/\/w\//);
  await expect(page.getByRole("navigation", { name: "App navigation" })).toBeVisible();
}

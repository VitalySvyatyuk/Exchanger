import { randomUUID } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";

export const PASSWORD = "Secret123";

export type TestUser = { name: string; email: string; page: Page };

/** Signs up a new user in a fresh browser context. */
export async function signUp(
  browser: Browser,
  name: string,
): Promise<TestUser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `${name.toLowerCase().replace(/\W+/g, "-")}-${randomUUID()}@example.test`;

  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/profile");

  return { name, email, page };
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/profile");
}

/** Converts USD into another currency on the Convert page. */
export async function convertFromUsd(page: Page, amount: string, to: string) {
  await page.goto("/convert");
  await page.getByLabel("You pay").fill(amount);
  await page.getByLabel("Currency to receive").selectOption(to);
  await page.getByRole("button", { name: `Convert USD to ${to}` }).click();
  await expect(statusMessage(page)).toContainText("Converted");
}

/**
 * The success message of a form. Not getByRole("status"): an <output>
 * element, used for previews, has the status role too.
 */
export function statusMessage(page: Page) {
  return page.locator("main p[role=status]");
}

/** The main form on a page (the header has a logout form too). */
export function mainForm(page: Page) {
  return page.locator("main form").first();
}

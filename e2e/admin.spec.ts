import { expect, test } from "@playwright/test";
import { TEST_ADMIN } from "../test/env";
import { logIn, signUp } from "./helpers";

test("the admin panel is hidden from regular users", async ({ browser }) => {
  const { page } = await signUp(browser, "Curious User");

  await expect(page.getByRole("link", { name: "Admin panel" })).toHaveCount(0);
  for (const path of ["/admin", "/admin/users", "/admin/transactions"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("an admin sees reconciled books and the transaction log", async ({
  browser,
  page,
}) => {
  const customer = await signUp(browser, "Audited Customer");

  await logIn(page, TEST_ADMIN.email, TEST_ADMIN.password);
  await page.getByRole("link", { name: "Admin panel" }).click();
  await expect(page).toHaveURL("/admin");

  await expect(page.getByText("All checks passed")).toBeVisible();
  const totals = page.locator("section[aria-labelledby=money-supply] tbody tr");
  await expect(totals).toHaveCount(5);
  for (const row of await totals.all()) {
    await expect(row.locator("td").last()).toHaveText(/^0\.0+$/);
  }

  await page.getByRole("link", { name: "Users", exact: true }).click();
  await page.getByRole("searchbox").fill(customer.email);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "Audited Customer" }).click();
  await expect(
    page.getByRole("heading", { name: "Audited Customer" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "View in transaction log" }).click();
  await expect(page).toHaveURL(/\/admin\/transactions\?user=/);
  const log = page.locator("main tbody");
  await expect(log).toContainText("Welcome bonus");
  await expect(log).toContainText(customer.email);
});

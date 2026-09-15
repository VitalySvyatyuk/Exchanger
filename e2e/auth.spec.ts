import { expect, test } from "@playwright/test";
import { logIn, PASSWORD, signUp } from "./helpers";

test("protected pages redirect guests to log in", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL("/login?next=%2Fprofile");
});

test("a new user gets $100 and can log out and back in", async ({
  browser,
}) => {
  const user = await signUp(browser, "Ada Lovelace");
  const { page } = user;

  await expect(
    page.getByRole("heading", { name: "Hello, Ada Lovelace" }),
  ).toBeVisible();
  await expect(page.getByText("$ 100.00")).toBeVisible();
  await expect(page.locator("#history")).toContainText("Welcome bonus");

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

  await logIn(page, user.email, PASSWORD);
  await expect(page.getByText("$ 100.00")).toBeVisible();
});

test("sign-up validates the form and keeps the entered values", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("A");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByText("Name must be at least 2 characters long."),
  ).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(
    page.getByText("Password must be at least 8 characters long."),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
});

test("login rejects a wrong password with a generic message", async ({
  browser,
  page,
}) => {
  const user = await signUp(browser, "Grace Hopper");

  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("Wrong1234");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.locator("main [role=alert]")).toHaveText(
    "Invalid email or password.",
  );
  await expect(page.getByLabel("Email")).toHaveValue(user.email);
});

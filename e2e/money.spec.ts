import { expect, test } from "@playwright/test";
import { mainForm, signUp, statusMessage } from "./helpers";

// The app runs with fixed test rates: 1 USD = 0.85 EUR, and a 0.5% fee.

test("converts USD to EUR at the previewed amount", async ({ browser }) => {
  const { page } = await signUp(browser, "Converter");
  await page.getByRole("link", { name: "Convert", exact: true }).click();

  const form = mainForm(page);
  await page.getByLabel("You pay").fill("40");
  // 40 × 0.85 × 0.995
  await expect(form.locator("output")).toHaveText("33.83");
  await expect(form).toContainText("1 USD = 0.84575 EUR");

  await page.getByRole("button", { name: "Convert USD to EUR" }).click();
  await expect(statusMessage(page)).toHaveText(
    "Converted 40.00 USD to 33.83 EUR.",
  );
  await expect(page.getByLabel("You pay")).toHaveValue("");
  await expect(form).toContainText("60.00 USD");

  await page.goto("/profile");
  await expect(page.locator("#history")).toContainText("USD → EUR");
  await expect(page.getByText("€ 33.83")).toBeVisible();
});

test("doesn't allow converting more than the balance", async ({ browser }) => {
  const { page } = await signUp(browser, "Big Spender");
  await page.goto("/convert");

  await page.getByLabel("You pay").fill("100.01");
  await expect(
    page.getByText("The amount exceeds your USD balance."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Convert USD to EUR" }),
  ).toBeDisabled();
});

test("sends money with a note, in the same and in another currency", async ({
  browser,
}) => {
  const alice = await signUp(browser, "Alice Sender");
  const bob = await signUp(browser, "Bob Receiver");
  const { page } = alice;

  await page.getByRole("link", { name: "Send", exact: true }).click();
  await page.getByLabel("Recipient", { exact: true }).fill(bob.email);
  await page.getByLabel("You send").click();
  await expect(page.locator("#recipient-status")).toContainText(
    "✓ Bob Receiver",
  );

  await page.getByLabel("You send").fill("15");
  await expect(mainForm(page)).toContainText("No fee in the same currency");
  await page.getByLabel("Note").fill("Concert tickets");
  await page.getByRole("button", { name: "Send 15.00 USD" }).click();
  await expect(statusMessage(page)).toHaveText(
    "Sent 15.00 USD to Bob Receiver.",
  );

  await page.getByLabel("Recipient", { exact: true }).fill(bob.email);
  await page.getByLabel("You send").fill("10");
  await page.getByLabel("Currency the recipient gets").selectOption("EUR");
  await page.getByRole("button", { name: "Send 10.00 USD" }).click();
  // 10 × 0.85 × 0.995 = 8.4575, rounded down
  await expect(statusMessage(page)).toHaveText(
    "Sent 10.00 USD to Bob Receiver. They receive 8.45 EUR.",
  );

  await bob.page.goto("/profile");
  const history = bob.page.locator("#history");
  await expect(history).toContainText("From Alice Sender · “Concert tickets”");
  await expect(history).toContainText("+8.45 EUR");
  await expect(bob.page.getByText("$ 115.00")).toBeVisible();
});

test("warns about unknown recipients and sending to yourself", async ({
  browser,
}) => {
  const user = await signUp(browser, "Lonely Sender");
  const { page } = user;
  await page.goto("/transfer");
  const recipient = page.getByLabel("Recipient", { exact: true });
  const status = page.locator("#recipient-status");

  await recipient.fill("nobody@example.test");
  await page.getByLabel("You send").click();
  await expect(status).toHaveText("There is no user with this email.");

  await recipient.fill(user.email);
  await page.getByLabel("You send").click();
  await expect(status).toContainText("That's you.");
});

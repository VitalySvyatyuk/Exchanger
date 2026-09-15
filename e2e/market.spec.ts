import { expect, test, type Page } from "@playwright/test";
import { convertFromUsd, signUp } from "./helpers";

/** Posts "sell <sell> USD for <ask> EUR" and returns the lot number. */
async function postLot(page: Page, sell: string, ask: string) {
  await page.goto("/market");
  const form = page.locator("main form", { hasText: "Post a lot" });
  await page.getByLabel("You sell").fill(sell);
  await page.getByLabel("Currency you ask for").selectOption("EUR");
  await page.getByLabel("You ask", { exact: true }).fill(ask);
  await form.getByRole("button", { name: "Post lot" }).click();

  const status = form.getByRole("status");
  await expect(status).toContainText("posted");
  return (await status.textContent())!.match(/#[0-9a-f]{8}/)![0];
}

function lotCard(page: Page, lotNumber: string) {
  return page
    .getByRole("list", { name: "Open lots" })
    .getByRole("listitem")
    .filter({
      hasText: lotNumber,
    });
}

test("a seller posts a lot and a buyer buys it", async ({ browser }) => {
  const seller = await signUp(browser, "Sally Seller");
  const buyer = await signUp(browser, "Bruno Buyer");

  const lot = await postLot(seller.page, "30", "24");
  await expect(
    seller.page.getByRole("list", { name: "Your open lots" }),
  ).toContainText(lot);

  // Without euros the buyer can't buy.
  await buyer.page.goto("/market");
  const card = lotCard(buyer.page, lot);
  await expect(card).toContainText("Sells 30.00 USD for 24.00 EUR", {
    useInnerText: true,
  });
  await expect(card).toContainText("vs market");
  await expect(card.getByRole("button", { name: "Buy" })).toBeDisabled();

  await convertFromUsd(buyer.page, "50", "EUR");
  await buyer.page.goto("/market");
  await card.getByRole("button", { name: "Buy" }).click();
  await expect(card).toContainText("Pay 24.00 EUR, get 30.00 USD?");
  await card.getByRole("button", { name: "Confirm purchase" }).click();

  await expect(buyer.page).toHaveURL(/bought=/);
  await expect(buyer.page.locator("#market-outcome")).toHaveText(
    "Purchase complete: you received 30.00 USD for 24.00 EUR.",
  );

  await seller.page.goto("/profile");
  await expect(seller.page.locator("#history")).toContainText(
    `Sold ${lot} to Bruno Buyer`,
  );
});

test("only one of two simultaneous buyers gets the lot", async ({
  browser,
}) => {
  const seller = await signUp(browser, "Race Seller");
  const buyers = await Promise.all([
    signUp(browser, "Racer One"),
    signUp(browser, "Racer Two"),
  ]);
  await Promise.all(
    buyers.map((buyer) => convertFromUsd(buyer.page, "20", "EUR")),
  );
  const lot = await postLot(seller.page, "5", "4");

  for (const { page } of buyers) {
    await page.goto("/market");
    await lotCard(page, lot).getByRole("button", { name: "Buy" }).click();
  }
  await Promise.all(
    buyers.map(({ page }) =>
      lotCard(page, lot)
        .getByRole("button", { name: "Confirm purchase" })
        .click(),
    ),
  );
  await Promise.all(
    buyers.map(({ page }) => expect(page).toHaveURL(/bought=|unavailable=/)),
  );

  const outcomes = buyers
    .map(({ page }) =>
      new URL(page.url()).searchParams.has("bought") ? "bought" : "unavailable",
    )
    .sort();
  expect(outcomes).toEqual(["bought", "unavailable"]);
});

test("a seller cancels a lot and gets the funds back", async ({ browser }) => {
  const { page } = await signUp(browser, "Changed Mind");
  const lot = await postLot(page, "10", "9");

  const own = page
    .getByRole("list", { name: "Your open lots" })
    .getByRole("listitem")
    .filter({ hasText: lot });
  await own.getByRole("button", { name: "Cancel lot" }).click();
  await own.getByRole("button", { name: "Confirm cancel" }).click();

  await expect(page.locator("#market-outcome")).toHaveText(
    `Lot ${lot} cancelled: 10.00 USD returned to your account.`,
  );
  await expect(
    page.locator("main form", { hasText: "Post a lot" }),
  ).toContainText("100.00 USD");
});

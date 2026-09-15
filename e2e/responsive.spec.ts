import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("pages don't scroll horizontally on a phone", async ({ browser }) => {
  const user = await signUp(browser, "Phone User");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addCookies(await user.page.context().cookies());
  const page = await context.newPage();

  for (const path of ["/", "/market", "/convert", "/transfer", "/profile"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

import { expect, test } from "@playwright/test";

const password = process.env.DEMO_PASSWORD || "";
const question =
  "Which leases expire within the next 60 days and need renewal notices?";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Good morning/ }),
  ).toBeVisible();
}

test("captures the seeded dashboard overview", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("Upcoming lease expirations")).toBeVisible();
  await expect(page.getByText("NC-2048").first()).toBeVisible();
  await page.screenshot({
    path: "../../docs/screenshots/overview.png",
    fullPage: true,
  });
});

test("captures an evidence-backed assistant answer", async ({ page }) => {
  await signIn(page);
  await page.locator("nav").getByRole("button", { name: "Assistant" }).click();
  await page.getByLabel("Your question").fill(question);
  await page.getByRole("button", { name: "Get answer" }).click();
  await expect(page.getByText(/NC-2048/).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Evidence-only response")).toBeVisible();
  await page.screenshot({
    path: "../../docs/screenshots/assistant.png",
    fullPage: true,
  });
});

test("captures the live security lab report", async ({ page }) => {
  await signIn(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Security Lab" })
    .click();
  await page.getByRole("button", { name: "Run security scenarios" }).click();
  await expect(page.getByText("passed", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({
    path: "../../docs/screenshots/security-lab.png",
    fullPage: true,
  });
});

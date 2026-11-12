import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Password").fill(process.env.DEMO_PASSWORD || "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: /Good morning/ }),
  ).toBeVisible();
}

test("answers the lease renewal question with a seeded record", async ({
  page,
}) => {
  await signIn(page);
  await page
    .locator("textarea")
    .first()
    .fill(
      "Which leases expire within the next 60 days and need renewal notices?",
    );
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(/NC-2048/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/renewal notice due/i)).toBeVisible();
  await expect(page.getByText("Evidence-backed response")).toBeVisible();
  await expect(
    page.getByText("Conflicting evidence", { exact: true }),
  ).toBeVisible();
});

test("shows the configured tenant security controls", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Security Lab" }).click();
  await expect(
    page.getByRole("heading", { name: "Security Lab" }),
  ).toBeVisible();
  await expect(
    page.getByText("Tenant isolation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run security scenarios" }),
  ).toBeVisible();
});

test("stores assistant conversations and reopens the authorized history", async ({
  page,
}) => {
  await signIn(page);
  await page.locator("nav").getByRole("button", { name: "Assistant" }).click();
  await page
    .getByLabel("Your question")
    .fill("Which leases expire in the next 60 days and need renewal notices?");
  await page.getByRole("button", { name: "Get answer" }).click();
  await expect(page.getByText(/NC-2048/).first()).toBeVisible({ timeout: 15_000 });
  await page.locator("nav").getByRole("button", { name: "Overview" }).click();
  await page.locator("nav").getByRole("button", { name: "Assistant" }).click();
  await page.getByRole("button", { name: "Which leases expire in the next 60 days and need renewal notices?", exact: true }).click();
  await expect(page.getByText(/NC-2048/).first()).toBeVisible();
});

test("shows organization member controls and audit history to administrators", async ({
  page,
}) => {
  await signIn(page);
  await page.locator("nav").getByRole("button", { name: "Members" }).click();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByText("admin@northstar.example")).toBeVisible();
  await page.locator("nav").getByRole("button", { name: "Audit" }).click();
  await expect(
    page.getByRole("heading", { name: "Audit history" }),
  ).toBeVisible();
});

test("creates an authorized lease record through the browser", async ({
  page,
}) => {
  await signIn(page);
  await page.locator("nav").getByRole("button", { name: "Leases" }).click();
  await page.getByRole("button", { name: "Add lease" }).click();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  const isoDate = (value: Date) => {
    const local = new Date(
      value.getTime() - value.getTimezoneOffset() * 60_000,
    );
    return local.toISOString().slice(0, 10);
  };
  await page.getByLabel("Property").selectOption({ label: "Cedar Court" });
  await expect(page.getByLabel("Unit")).toBeEnabled();
  await page.getByLabel("Unit").selectOption({ label: "4B" });
  const reference = `E2E-${Date.now()}`;
  await page.getByLabel("Lease reference").fill(reference);
  await page.getByLabel("Resident name").fill("Jordan Example");
  await page.getByLabel("Starts on").fill(isoDate(new Date()));
  await page.getByLabel("Expires on").fill(isoDate(expires));
  await page.getByLabel("Notice period (days)").fill("30");
  await page.getByRole("button", { name: "Save lease" }).click();
  const row = page.getByRole("row").filter({ hasText: reference });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(
    page.getByRole("heading", { name: `Edit lease ${reference}` }),
  ).toBeVisible();
  const updatedReference = `${reference}-EDITED`;
  await page.getByLabel("Lease reference").fill(updatedReference);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(updatedReference)).toBeVisible({
    timeout: 10_000,
  });
});

test("replaces a document version and shows version history", async ({
  page,
}) => {
  await signIn(page);
  await page.locator("nav").getByRole("button", { name: "Knowledge" }).click();
  const row = page
    .getByRole("row")
    .filter({ hasText: "Harbor Residential Lease" });
  await row.getByLabel("Replace Harbor Residential Lease").setInputFiles({
    name: "lease-replacement.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# Lease replacement\n\nA synthetic updated notice clause says 60 calendar days before expiration.",
    ),
  });
  await expect(
    page.getByRole("status").getByText(/queued for indexing/),
  ).toBeVisible();
  await row.getByText("Versions").click();
  await expect(row.getByText(/v2 · (queued|ready) · current/)).toBeVisible();
});

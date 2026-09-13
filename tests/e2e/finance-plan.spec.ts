import { expect, test, type Page } from "@playwright/test";
import { adminCredentials, memberCredentials, signIn } from "./support";

const source = (page: Page, name: string) =>
  page.locator(`[data-testid="finance-source"][data-source-name="${name}"]`);

async function addSource(
  page: Page,
  input: {
    name: string;
    amount: string;
    status?: "Targeted" | "Soft committed";
  },
) {
  await page.getByRole("button", { name: "Add Funding Source" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(input.name);
  await dialog.getByLabel("Source amount").fill(input.amount);
  await dialog.getByLabel("Source amount").press("Enter");
  if (input.status) {
    await dialog.getByRole("combobox", { name: "Source status" }).click();
    await page.getByRole("option", { name: input.status, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Create Source" }).click();
  await expect(source(page, input.name)).toBeVisible();
}

test("finance plan: sources against a locked budget, exact gap, admin-only approval that freezes the source", async ({
  page,
  browser,
}) => {
  await signIn(page, adminCredentials);
  await page
    .getByRole("button", { name: "New Project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project Title").fill("Financed Feature");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByText("Financed Feature", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  const projectUrl = page.url();

  // Without a locked budget the plan cannot be created.
  await page.goto(`${projectUrl}/financing/finance-plan`);
  await expect(page.getByText("Lock a budget first")).toBeVisible();

  // Build and lock a GBP budget worth exactly 1,234,567.89.
  await page.goto(`${projectUrl}/financing/budget`);
  await page.getByLabel("Currency").click();
  await page.getByRole("option", { name: /GBP/ }).click();
  await page.getByRole("button", { name: "Create Budget Draft" }).click();
  await expect(page.getByTestId("budget-status")).toHaveText("Draft");
  const production = page.locator(
    '[data-testid="budget-department"][data-department-name="Production"]',
  );
  await production
    .getByRole("button", { name: "Toggle Production", exact: true })
    .click();
  await production.getByRole("button", { name: "Add Item" }).click();
  const row = production.getByTestId("budget-line-item").nth(0);
  await row.getByLabel("Item name").fill("Everything");
  await row.getByLabel("Item name").press("Enter");
  await row.getByLabel("Item amount").fill("1234567.89");
  await row.getByLabel("Item amount").press("Enter");
  await expect(page.getByTestId("budget-total")).toHaveText("£1,234,567.89");
  await page.getByRole("button", { name: "Submit for Approval" }).click();
  await page.getByRole("button", { name: "Approve & Lock" }).click();
  await expect(page.getByTestId("budget-status")).toHaveText("Locked");

  // Create the plan against locked v1; the baseline is the locked total.
  await page.goto(`${projectUrl}/financing/finance-plan`);
  await page
    .getByRole("button", { name: "Create plan against locked budget v1" })
    .click();
  await expect(page.getByTestId("finance-total-budget")).toHaveText(
    "£1,234,567.89",
  );
  await expect(page.getByTestId("finance-secured")).toHaveText("£0.00");
  await expect(page.getByTestId("finance-gap")).toHaveText("£1,234,567.89");

  // Two sources: exact cents, and only approved money counts as secured.
  await addSource(page, { name: "Angel equity", amount: "0.1" });
  await addSource(page, {
    name: "Regional grant",
    amount: "1234567.79",
    status: "Soft committed",
  });
  await expect(
    source(page, "Angel equity").getByTestId("finance-source-amount"),
  ).toHaveText("£0.10");
  await expect(
    source(page, "Regional grant").getByTestId("finance-source-status"),
  ).toHaveText("Soft committed");
  await expect(page.getByTestId("finance-secured")).toHaveText("£0.00");
  await expect(page.getByTestId("finance-gap")).toHaveText("£1,234,567.89");

  // The admin approves the grant through the confirmation; the gap becomes 0.10.
  await source(page, "Regional grant")
    .getByRole("button", { name: "Toggle Regional grant" })
    .click();
  await source(page, "Regional grant")
    .getByRole("combobox", { name: "Source status" })
    .click();
  await page.getByRole("option", { name: "Approved (verify & lock)" }).click();
  await expect(page.getByText("Confirm Approval")).toBeVisible();
  await page.getByRole("button", { name: "Verify & Approve" }).click();
  await expect(
    source(page, "Regional grant").getByTestId("finance-source-status"),
  ).toHaveText("Approved");
  await expect(page.getByTestId("finance-secured")).toHaveText("£1,234,567.79");
  await expect(page.getByTestId("finance-gap")).toHaveText("£0.10");
  await expect(
    source(page, "Regional grant").getByText(/Approved by Test Admin/),
  ).toBeVisible();
  await expect(
    source(page, "Regional grant").getByLabel("Source amount"),
  ).toBeDisabled();

  // Reload: everything persists from PostgreSQL.
  await page.reload();
  await expect(page.getByTestId("finance-gap")).toHaveText("£0.10");
  await expect(page.getByTestId("finance-source")).toHaveCount(2);

  // A second, ordinary user shares the plan, may add and edit unapproved
  // sources, has no approval option, and is refused approval by the server.
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, memberCredentials);
  await otherPage.goto(`${projectUrl}/financing/finance-plan`);
  await expect(otherPage.getByTestId("finance-gap")).toHaveText("£0.10");
  await addSource(otherPage, {
    name: "Bank loan",
    amount: "0.1",
    status: "Soft committed",
  });
  await source(otherPage, "Angel equity")
    .getByRole("button", { name: "Toggle Angel equity" })
    .click();
  await source(otherPage, "Angel equity")
    .getByRole("combobox", { name: "Source status" })
    .click();
  await expect(
    otherPage.getByRole("option", { name: "Approved (verify & lock)" }),
  ).toHaveCount(0);
  await otherPage.keyboard.press("Escape");
  await expect(
    source(otherPage, "Angel equity").getByRole("button", {
      name: "Remove Source",
    }),
  ).toHaveCount(0);
  const projectId = projectUrl.split("/project/")[1]!.split("/")[0]!;
  const planResponse = await otherPage.request.get(
    `/api/v1/projects/${projectId}/finance-plan`,
  );
  const plan = (await planResponse.json()).data as {
    sources: { id: string; name: string; version: number }[];
  };
  const angel = plan.sources.find((s) => s.name === "Angel equity")!;
  const refused = await otherPage.request.post(
    `/api/v1/projects/${projectId}/finance-plan/sources/${angel.id}/approve`,
    { data: { version: angel.version } },
  );
  expect(refused.status()).toBe(403);
  await otherContext.close();

  // The admin's page picks up the member's source; the gap is now exactly 0.
  await page.reload();
  await expect(page.getByTestId("finance-source")).toHaveCount(3);
  await expect(
    source(page, "Bank loan").getByTestId("finance-source-status"),
  ).toHaveText("Soft committed");
  await expect(page.getByTestId("finance-gap")).toHaveText("£0.10");
});

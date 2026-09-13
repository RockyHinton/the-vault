import { expect, test, type Page } from "@playwright/test";
import { adminCredentials, memberCredentials, signIn } from "./support";

const department = (page: Page, name: string) =>
  page.locator(
    `[data-testid="cash-department"][data-department-name="${name}"]`,
  );
const period = (page: Page, id: string) =>
  page.locator(`[data-testid="cash-period"][data-period-id="${id}"]`);

test("finance completion: locked budget → approved financing → cash flow schedule → derived overview", async ({
  page,
  browser,
}) => {
  await signIn(page, adminCredentials);
  await page
    .getByRole("button", { name: "New Project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project Title").fill("Cash Flow Feature");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByText("Cash Flow Feature", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  const projectUrl = page.url();
  const projectId = projectUrl.split("/project/")[1]!.split("/")[0]!;

  // The overview and cash flow are honest about an empty project.
  await page.goto(`${projectUrl}/financing`);
  await expect(page.getByTestId("overview-total-budget")).toHaveText(
    "No budget has been started yet.",
  );
  await page.goto(`${projectUrl}/financing/cashflow`);
  await expect(page.getByText("Create the finance plan first")).toBeVisible();

  // Locked GBP budget: Production 1,000.00 (v1).
  await page.goto(`${projectUrl}/financing/budget`);
  await page.getByLabel("Currency").click();
  await page.getByRole("option", { name: /GBP/ }).click();
  await page.getByRole("button", { name: "Create Budget Draft" }).click();
  const production = page.locator(
    '[data-testid="budget-department"][data-department-name="Production"]',
  );
  await production
    .getByRole("button", { name: "Toggle Production", exact: true })
    .click();
  await production.getByRole("button", { name: "Add Item" }).click();
  const row = production.getByTestId("budget-line-item").nth(0);
  await row.getByLabel("Item name").fill("Crew");
  await row.getByLabel("Item name").press("Enter");
  await row.getByLabel("Item amount").fill("1000");
  await row.getByLabel("Item amount").press("Enter");
  await expect(page.getByTestId("budget-total")).toHaveText("£1,000.00");
  await page.getByRole("button", { name: "Submit for Approval" }).click();
  await page.getByRole("button", { name: "Approve & Lock" }).click();
  await expect(page.getByTestId("budget-status")).toHaveText("Locked");

  // Finance plan with one approved source of 600.10 expected in March 2027.
  await page.goto(`${projectUrl}/financing/finance-plan`);
  await page
    .getByRole("button", { name: "Create plan against locked budget v1" })
    .click();
  await page.getByRole("button", { name: "Add Funding Source" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Equity partner");
  await dialog.getByLabel("Source amount").fill("600.1");
  await dialog.getByLabel("Source amount").press("Enter");
  await dialog.getByLabel("Expected").fill("2027-03-15");
  await dialog.getByRole("button", { name: "Create Source" }).click();
  const source = page.locator(
    '[data-testid="finance-source"][data-source-name="Equity partner"]',
  );
  await source.getByRole("button", { name: "Toggle Equity partner" }).click();
  await source.getByRole("combobox", { name: "Source status" }).click();
  await page.getByRole("option", { name: "Approved (verify & lock)" }).click();
  await page.getByRole("button", { name: "Verify & Approve" }).click();
  await expect(page.getByTestId("finance-secured")).toHaveText("£600.10");

  // Start the cash flow: departments come from locked v1, inflows from the approved source.
  await page.goto(`${projectUrl}/financing/cashflow`);
  await page.getByRole("button", { name: "Start Cash Flow" }).click();
  await expect(page.getByTestId("cash-total-budget")).toHaveText("£1,000.00");
  await expect(page.getByTestId("cash-secured")).toHaveText("£600.10");
  await expect(page.getByTestId("cash-gap")).toHaveText("£399.90");
  await expect(
    period(page, "2027-03").getByTestId("cash-period-inflow"),
  ).toHaveText("£600.10");

  // A spend window for Production across April 2027 (30 days) puts exactly 1,000.00 in April.
  await department(page, "Production")
    .getByRole("button", { name: "Toggle Production" })
    .click();
  await department(page, "Production")
    .getByLabel("Window start")
    .fill("2027-04-01");
  await department(page, "Production").getByLabel("Window start").blur();
  await department(page, "Production")
    .getByLabel("Window end")
    .fill("2027-04-30");
  await department(page, "Production").getByLabel("Window end").blur();
  await expect(
    period(page, "2027-04").getByTestId("cash-period-outflow"),
  ).toHaveText("(£1,000.00)");
  await expect(
    period(page, "2027-04").getByTestId("cash-period-balance"),
  ).toHaveText("-£399.90");
  await expect(page.getByTestId("cash-shortfall")).toContainText("Apr 2027");

  // Opening balance and a one-off receipt close the gap exactly: 399.80 + 0.10.
  await page.getByLabel("Opening balance").fill("399.8");
  await page.getByLabel("Opening balance").press("Enter");
  await expect(
    period(page, "2027-04").getByTestId("cash-period-balance"),
  ).toHaveText("-£0.10");
  await department(page, "Production")
    .getByRole("button", { name: "Add Payment" })
    .click();
  const paymentDialog = page.getByRole("dialog");
  await paymentDialog.getByLabel("Name").fill("Location rebate");
  await paymentDialog.getByLabel("Payment amount").fill("0.10");
  await paymentDialog.getByLabel("Payment amount").press("Enter");
  await paymentDialog.getByLabel("Date").fill("2027-02-01");
  await paymentDialog.getByRole("button", { name: "Inflow (Receipt)" }).click();
  await paymentDialog.getByRole("button", { name: "Add Payment" }).click();
  await expect(
    period(page, "2027-04").getByTestId("cash-period-balance"),
  ).toHaveText("£0.00");
  await expect(page.getByTestId("cash-shortfall")).toContainText(
    "Cash Positive",
  );
  await expect(page.getByTestId("cash-low-point")).toHaveText("£0.00");

  // Reload: everything persists from PostgreSQL.
  await page.reload();
  await expect(page.getByTestId("cash-low-point")).toHaveText("£0.00");
  await expect(
    period(page, "2027-04").getByTestId("cash-period-outflow"),
  ).toHaveText("(£1,000.00)");

  // A second, ordinary user shares the schedule, may edit timing, but cannot remove the admin's payment.
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, memberCredentials);
  await otherPage.goto(`${projectUrl}/financing/cashflow`);
  await expect(otherPage.getByTestId("cash-low-point")).toHaveText("£0.00");
  await department(otherPage, "Production")
    .getByRole("button", { name: "Toggle Production" })
    .click();
  await expect(
    department(otherPage, "Production").getByRole("button", {
      name: "Remove Location rebate",
    }),
  ).toHaveCount(0);
  const cashFlow = (
    await (
      await otherPage.request.get(`/api/v1/projects/${projectId}/cash-flow`)
    ).json()
  ).data as {
    departments: {
      name: string;
      payments: { id: string; version: number }[];
    }[];
  };
  const payment = cashFlow.departments.find((d) => d.name === "Production")!
    .payments[0]!;
  const refused = await otherPage.request.delete(
    `/api/v1/projects/${projectId}/cash-flow/payments/${payment.id}`,
    { data: { version: payment.version } },
  );
  expect(refused.status()).toBe(403);
  await otherPage
    .getByLabel("Expected date for Equity partner")
    .fill("2027-05-20");
  await otherPage.getByLabel("Expected date for Equity partner").blur();
  await expect(
    period(otherPage, "2027-05").getByTestId("cash-period-inflow"),
  ).toHaveText("£600.10");
  await expect(otherPage.getByTestId("cash-shortfall")).toContainText(
    "Apr 2027",
  );
  await otherContext.close();

  // The overview is derived from all three domains and shows the member's change.
  await page.goto(`${projectUrl}/financing`);
  await expect(page.getByTestId("overview-total-budget")).toHaveText(
    "£1,000.00",
  );
  await expect(page.getByTestId("overview-secured")).toHaveText("£600.10");
  await expect(page.getByTestId("overview-gap")).toHaveText("£399.90");
  await expect(page.getByTestId("overview-source")).toHaveCount(1);
  await expect(page.getByTestId("overview-secured-total")).toHaveText(
    "£600.10",
  );
  await expect(page.getByTestId("overview-closing")).toHaveText("£0.00");
  await expect(page.getByTestId("overview-shortfall")).toHaveText("Apr 2027");
});

import { expect, test, type Page } from "@playwright/test";
import { adminCredentials, memberCredentials, signIn } from "./support";

const department = (page: Page, name: string) =>
  page.locator(
    `[data-testid="budget-department"][data-department-name="${name}"]`,
  );

async function setLineItem(
  row: ReturnType<Page["getByTestId"]>,
  name: string,
  amount: string,
) {
  await row.getByLabel("Item name").fill(name);
  await row.getByLabel("Item name").press("Enter");
  await row.getByLabel("Item amount").fill(amount);
  await row.getByLabel("Item amount").press("Enter");
}

test("budget: exact totals persist, lifecycle locks history, and a revision leaves the locked version untouched", async ({
  page,
  browser,
}) => {
  await signIn(page, adminCredentials);
  await page
    .getByRole("button", { name: "New Project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project Title").fill("Budgeted Feature");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByText("Budgeted Feature", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  const projectUrl = page.url();

  // Create the budget in GBP; version 1 is a draft with the default departments.
  await page.goto(`${projectUrl}/financing/budget`);
  await expect(page.getByText("No Budget Started")).toBeVisible();
  await page.getByLabel("Currency").click();
  await page.getByRole("option", { name: /GBP/ }).click();
  await page.getByRole("button", { name: "Create Budget Draft" }).click();
  await expect(page.getByTestId("budget-status")).toHaveText("Draft");
  await expect(page.getByTestId("budget-version-number")).toHaveText("v1");
  await expect(page.getByTestId("budget-department")).toHaveCount(5);
  await expect(page.getByTestId("budget-total")).toHaveText("£0.00");

  // Two exact line items in Production: 0.10 + 0.20 must be 0.30.
  const production = department(page, "Production");
  await production
    .getByRole("button", { name: "Toggle Production", exact: true })
    .click();
  await production.getByRole("button", { name: "Add Item" }).click();
  await setLineItem(
    production.getByTestId("budget-line-item").nth(0),
    "Camera package",
    "0.10",
  );
  await production.getByRole("button", { name: "Add Item" }).click();
  await setLineItem(
    production.getByTestId("budget-line-item").nth(1),
    "Grip",
    "0.2",
  );
  await expect(production.getByTestId("department-total").first()).toHaveText(
    "£0.30",
  );
  await expect(page.getByTestId("budget-total")).toHaveText("£0.30");

  // A large amount elsewhere keeps exact cents.
  const post = department(page, "Post-Production");
  await post
    .getByRole("button", { name: "Toggle Post-Production", exact: true })
    .click();
  await post.getByRole("button", { name: "Add Item" }).click();
  await setLineItem(
    post.getByTestId("budget-line-item").nth(0),
    "Colour",
    "1234567.89",
  );
  await expect(page.getByTestId("budget-total")).toHaveText("£1,234,568.19");

  // Reload: everything persists.
  await page.reload();
  await expect(page.getByTestId("budget-total")).toHaveText("£1,234,568.19");

  // Submit, then approve and lock as the admin; the version becomes read-only.
  await page.getByRole("button", { name: "Submit for Approval" }).click();
  await expect(page.getByTestId("budget-status")).toHaveText(
    "Awaiting approval",
  );
  await expect(
    page.getByRole("button", { name: "Add Department" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Approve & Lock" }).click();
  await expect(page.getByTestId("budget-status")).toHaveText("Locked");
  await expect(
    page.getByText(/This budget is locked by Test Admin/),
  ).toBeVisible();
  await department(page, "Production")
    .getByRole("button", { name: "Toggle Production", exact: true })
    .click();
  await expect(
    department(page, "Production").getByLabel("Item amount").first(),
  ).toBeDisabled();

  // A revision copies v1 into draft v2; editing v2 leaves v1 exactly as locked.
  await page.getByRole("button", { name: "Make Changes to Budget" }).click();
  await expect(page.getByTestId("budget-version-number")).toHaveText("v2");
  await expect(page.getByTestId("budget-status")).toHaveText("Draft");
  await expect(page.getByTestId("budget-total")).toHaveText("£1,234,568.19");
  const productionV2 = department(page, "Production");
  await productionV2
    .getByRole("button", { name: "Toggle Production", exact: true })
    .click();
  await productionV2
    .getByTestId("budget-line-item")
    .nth(0)
    .getByLabel("Item amount")
    .fill("500");
  await productionV2
    .getByTestId("budget-line-item")
    .nth(0)
    .getByLabel("Item amount")
    .press("Enter");
  await expect(page.getByTestId("budget-total")).toHaveText("£1,235,068.09");

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByTestId("budget-history-row")).toHaveCount(2);
  await page
    .getByTestId("budget-history-row")
    .filter({ hasText: "v1 · Locked" })
    .click();
  await expect(page.getByTestId("budget-version-number")).toHaveText("v1");
  await expect(page.getByTestId("budget-total")).toHaveText("£1,234,568.19");
  await expect(page.getByText("History View")).toBeVisible();
  await page.getByRole("button", { name: "Back to Current Budget" }).click();
  await expect(page.getByTestId("budget-version-number")).toHaveText("v2");

  // A second user sees the shared draft, may edit it and submit it, but cannot approve.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, memberCredentials);
  await otherPage.goto(`${projectUrl}/financing/budget`);
  await expect(otherPage.getByTestId("budget-version-number")).toHaveText("v2");
  await expect(otherPage.getByTestId("budget-total")).toHaveText(
    "£1,235,068.09",
  );
  await otherPage.getByRole("button", { name: "Submit for Approval" }).click();
  await expect(otherPage.getByTestId("budget-status")).toHaveText(
    "Awaiting approval",
  );
  await expect(
    otherPage.getByRole("button", { name: "Approve & Lock" }),
  ).toHaveCount(0);
  await other.close();
});

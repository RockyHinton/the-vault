import { expect, test } from "@playwright/test";
import { adminCredentials, signIn } from "./support";

test("the seeded admin signs in, creates a project and opens its workspace", async ({
  page,
}) => {
  await signIn(page, adminCredentials);
  await page
    .getByRole("button", { name: "New Project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project Title").fill("Browser Project");
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(
    page.getByText("Browser Project", { exact: true }),
  ).toBeVisible();
  await page.getByText("Browser Project", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  await expect(page.getByText("Project Evaluation Overview")).toBeVisible();

  // A refresh keeps the session.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
});

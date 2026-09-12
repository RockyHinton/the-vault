import { expect, test } from "@playwright/test";

test("test-factory identity can access Projects, create a project, and open its workspace", async ({
  page,
  request,
}) => {
  const me = await request.get("/api/v1/auth/me");
  expect(me.ok()).toBeTruthy();
  expect((await me.json()).data.user.email).toBe("playwright@vault.test");

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
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
});

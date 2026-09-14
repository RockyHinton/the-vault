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

  // Later stages are honest: production tools and scheduling are stated as
  // not yet available, never simulated.
  const projectId = page.url().split("/project/")[1]!.split("/")[0]!;
  const transition = async (toStage: string) => {
    const current = (
      await (await page.request.get(`/api/v1/projects/${projectId}`)).json()
    ).data as { version: number };
    const response = await page.request.post(
      `/api/v1/projects/${projectId}/stage-transitions`,
      { data: { toStage, version: current.version } },
    );
    expect(response.status()).toBe(200);
  };
  await transition("development");
  await transition("production");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Production tools are not yet available",
    }),
  ).toBeVisible();
  await expect(page.getByText(/Day \d+ of \d+|On Schedule/)).toHaveCount(0);
  await expect(page.getByTestId("production-upcoming")).toContainText(
    "Coming later",
  );
  await page.locator("aside").getByText("Schedules", { exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Scheduling tools are not yet available",
    }),
  ).toBeVisible();
});

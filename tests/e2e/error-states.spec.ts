import { expect, test, type Page } from "@playwright/test";
import { adminCredentials, signIn } from "./support";

/**
 * A failed load is an error, never business state: not "empty", not "not
 * found". Each surface is loaded once with its API call failing (injected in
 * the browser, the server is untouched) and once for real.
 */

const failGet = (page: Page, url: string) =>
  page.route(url, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "INTERNAL_ERROR",
              message: "Something went wrong.",
              requestId: "e2e-injected-failure",
            },
          }),
        })
      : route.fallback(),
  );

test("failed loads render errors, never an empty or not-found state", async ({
  page,
}) => {
  await signIn(page, adminCredentials);
  const project = await page.request.post("/api/v1/projects", {
    data: { title: "Error Truth" },
  });
  expect(project.status()).toBe(201);
  const projectId = (await project.json()).data.id as string;
  const projectUrl = `/project/${projectId}`;
  const apiBase = `**/api/v1/projects/${projectId}`;

  // Project workspace: an outage is not "Project not found", and retry recovers.
  await failGet(page, apiBase);
  await page.goto(projectUrl);
  await expect(
    page.getByText("The project could not be loaded."),
  ).toBeVisible();
  await expect(page.getByText("Project not found")).toHaveCount(0);
  await page.unroute(apiBase);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  // A project that really does not exist is still "not found".
  await page.goto("/project/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("Project not found")).toBeVisible();

  // Project notes: an outage is not "No notes yet".
  await failGet(page, `${apiBase}/notes`);
  await page.goto(`${projectUrl}/project-notes`);
  await expect(
    page.getByText("Project notes could not be loaded."),
  ).toBeVisible();
  await expect(page.getByText("No notes yet")).toHaveCount(0);
  await page.unroute(`${apiBase}/notes`);
  await page.reload();
  await expect(page.getByText("No notes yet")).toBeVisible();

  // Script reader: an outage is not a missing script.
  const staged = await page.request.post("/api/v1/files", {
    headers: {
      "content-type": "application/octet-stream",
      "x-vault-filename": "draft.pdf",
    },
    data: Buffer.from("%PDF-1.4\n% error-state draft\n%%EOF\n"),
  });
  expect(staged.status()).toBe(201);
  const script = await page.request.post(
    `/api/v1/projects/${projectId}/scripts`,
    {
      data: { fileObjectId: (await staged.json()).data.id, title: "Draft" },
    },
  );
  expect(script.status()).toBe(201);
  const detail = (await script.json()).data as {
    script: { id: string };
    versions: { id: string }[];
  };
  const scriptApi = `${apiBase}/scripts/${detail.script.id}`;
  await failGet(page, scriptApi);
  await page.goto(
    `/script-reader/${projectId}/${detail.script.id}/${detail.versions[0]!.id}`,
  );
  await expect(page.getByText("The script could not be loaded.")).toBeVisible();
  await expect(page.getByText("Script version not found")).toHaveCount(0);
  await page.unroute(scriptApi);
  await page.goto(
    `/script-reader/${projectId}/00000000-0000-4000-8000-000000000000/${detail.versions[0]!.id}`,
  );
  await expect(page.getByText("Script version not found")).toBeVisible();

  // Territory detail: an outage renders an explicit error, not a blank or "no longer available".
  const territory = await page.request.post(
    `/api/v1/projects/${projectId}/distribution/territories`,
    { data: { name: "Japan" } },
  );
  expect(territory.status()).toBe(201);
  const territoryApi = `${apiBase}/distribution/territories/${(await territory.json()).data.id}`;
  await failGet(page, territoryApi);
  await page.goto(`${projectUrl}/distribution`);
  await page
    .locator('[data-testid="territory-card"][data-territory-name="Japan"]')
    .click();
  await expect(
    page.getByText("This territory could not be loaded."),
  ).toBeVisible();
  await expect(
    page.getByText("This territory is no longer available."),
  ).toHaveCount(0);
  await page.unroute(territoryApi);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Japan" })).toBeVisible();
});

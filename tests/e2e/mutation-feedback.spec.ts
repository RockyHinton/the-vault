import { expect, test } from "@playwright/test";
import { adminCredentials, meetEvaluationGates, signIn } from "./support";

/**
 * Mutation outcomes are visible to the user: a server refusal, a version
 * conflict and a success each appear once, as the user sees them. The
 * Projects list's "Advance Stage" is used because it has no readiness logic
 * of its own: whatever it shows is the server's answer.
 */
test("the Projects list shows a refused stage change, a conflict and a success", async ({
  page,
}) => {
  await signIn(page, adminCredentials);
  const created = await page.request.post("/api/v1/projects", {
    data: { title: "Feedback Truth" },
  });
  expect(created.status()).toBe(201);
  const projectId = (await created.json()).data.id as string;
  await page.reload();

  const advance = async () => {
    await page
      .getByRole("button", { name: "Actions for Feedback Truth" })
      .click();
    await page.getByRole("menuitem", { name: "Advance Stage" }).click();
  };

  // Refused by the server's readiness rule: the checklist is unmet.
  await advance();
  await expect(
    page.getByText(
      /^This project is not ready for Development: Decision checklist: Script approved is not met\./,
    ),
  ).toBeVisible();

  // The checklist is met, but someone else edits the project meanwhile:
  // this list's copy is stale, so the command is a conflict.
  await meetEvaluationGates(page.request, projectId);
  const current = (
    await (await page.request.get(`/api/v1/projects/${projectId}`)).json()
  ).data as { version: number };
  const edited = await page.request.patch(`/api/v1/projects/${projectId}`, {
    data: { logline: "Edited elsewhere.", version: current.version },
  });
  expect(edited.status()).toBe(200);
  await advance();
  await expect(
    page.getByText(
      "This project changed while you were editing it. Refresh and try again.",
    ),
  ).toBeVisible();

  // The conflict refetched the list; the next attempt succeeds, once.
  await advance();
  const success = page.getByText("Project moved to Development.");
  await expect(success).toBeVisible();
  await expect(success).toHaveCount(1);
  const after = (
    await (await page.request.get(`/api/v1/projects/${projectId}`)).json()
  ).data as { stage: string };
  expect(after.stage).toBe("development");
});

import { expect, test, type Page } from "@playwright/test";
import { adminCredentials, memberCredentials, signIn } from "./support";

/** Picks an option from a Radix select opened through its labelled trigger. */
async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("evaluation, notes and tasks persist on the server and are shared across users", async ({
  page,
  browser,
}) => {
  // Admin signs in and creates a project through the UI.
  await signIn(page, adminCredentials);
  await page
    .getByRole("button", { name: "New Project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project Title").fill("Northern Lights");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByText("Northern Lights", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  const projectUrl = page.url();

  // Evaluation profile: edit writer, budget, finance types.
  await page.getByRole("button", { name: "Edit evaluation" }).click();
  await page.getByLabel("Writer").fill("Ada Screenwriter");
  await page.getByLabel("Est. Budget").fill("$5M");
  await page.getByRole("checkbox", { name: "Equity" }).click();
  await page.getByRole("checkbox", { name: "Pre-sale" }).click();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Ada Screenwriter")).toBeVisible();
  await expect(
    page.locator("dd").getByText("Pre-sale", { exact: true }),
  ).toBeVisible();

  // Decision gates are server state; the approve button unlocks only when all four are met.
  const approve = page.getByRole("button", { name: "Approve for Dev" });
  await expect(approve).toBeDisabled();
  for (const gate of [
    "Script approved",
    "Budget approved",
    "Finance approved",
    "Talent attached",
  ]) {
    await page.getByRole("checkbox", { name: gate }).click();
    await expect(page.getByRole("checkbox", { name: gate })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  }
  await expect(approve).toBeEnabled();

  // Team review: score, submit, see it in the list with the derived verdict.
  await page.getByRole("button", { name: "Project Scoring" }).click();
  await page.getByLabel("Summary Notes").fill("Strong script, solid package.");
  await page.getByRole("button", { name: "Submit Review" }).click();
  const reviewCard = page.getByTestId("review-card").filter({
    hasText: "Script: 5",
  });
  await expect(reviewCard).toBeVisible();
  await expect(reviewCard.getByText("Avg Score")).toBeVisible();
  await page.getByRole("button", { name: "Back to Overview" }).click();
  await expect(page.getByText("1 Review", { exact: true })).toBeVisible();

  // Project note.
  await page.getByRole("button", { name: "Project Notes" }).click();
  await expect(
    page.getByRole("heading", { name: "Project Notes" }),
  ).toBeVisible();
  await page.getByLabel("Note").fill("Third act needs a stronger turn.");
  await page.getByRole("button", { name: "Post Note" }).click();
  const note = page.getByTestId("project-note").filter({
    hasText: "Third act needs a stronger turn.",
  });
  await expect(note).toBeVisible();
  await expect(note.getByRole("button", { name: "Delete note" })).toBeVisible();

  // Approve for development so the task board is in play.
  await page.goto(projectUrl);
  await page.getByRole("button", { name: "Approve for Dev" }).click();
  await page.getByRole("button", { name: "Approve Project" }).click();
  await expect(page.getByRole("button", { name: "Add Task" })).toBeVisible();

  // Task assigned to a real user from the directory.
  await page.getByRole("button", { name: "Add Task" }).click();
  await page.getByLabel("Title").fill("Chase the completion bond");
  await choose(page, "Category", "Legal");
  await choose(page, "Priority", "High");
  await choose(page, "Assignee", "Test Member");
  await page.getByRole("button", { name: "Create Task" }).click();
  const task = page.getByTestId("task-card").filter({
    hasText: "Chase the completion bond",
  });
  await expect(task).toBeVisible();
  await expect(task.getByText("Test Member")).toBeVisible();
  await expect(task.getByText("Legal", { exact: true })).toBeVisible();

  // Reload: everything came back from the server.
  await page.reload();
  await expect(
    page
      .getByTestId("task-card")
      .filter({ hasText: "Chase the completion bond" }),
  ).toBeVisible();
  await page.goto(`${projectUrl}/project-notes`);
  await expect(
    page.getByTestId("project-note").filter({ hasText: "Third act" }),
  ).toBeVisible();

  // A second user sees the shared state and only the controls their role allows.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, memberCredentials);
  await otherPage.goto(`${projectUrl}/project-notes`);
  const adminNote = otherPage.getByTestId("project-note").filter({
    hasText: "Third act",
  });
  await expect(adminNote).toBeVisible();
  await expect(
    adminNote.getByRole("button", { name: "Delete note" }),
  ).toHaveCount(0);
  await otherPage.getByLabel("Note").fill("Agree on the third act.");
  await otherPage.getByRole("button", { name: "Post Note" }).click();
  const ownNote = otherPage.getByTestId("project-note").filter({
    hasText: "Agree on the third act.",
  });
  await expect(
    ownNote.getByRole("button", { name: "Delete note" }),
  ).toBeVisible();

  await otherPage.goto(projectUrl);
  const assigned = otherPage.getByTestId("task-card").filter({
    hasText: "Chase the completion bond",
  });
  await expect(assigned).toBeVisible();
  // Not the creator: no delete control, but completing is collaborative.
  await expect(
    assigned.getByRole("button", { name: "Delete Chase the completion bond" }),
  ).toHaveCount(0);
  await assigned
    .getByRole("checkbox", { name: "Complete Chase the completion bond" })
    .click();
  await expect(
    otherPage.getByRole("button", { name: "Reopen Chase the completion bond" }),
  ).toBeVisible();
  await other.close();

  // The admin sees the member's completion after a reload.
  await page.goto(projectUrl);
  await expect(
    page.getByRole("button", { name: "Reopen Chase the completion bond" }),
  ).toBeVisible();
});

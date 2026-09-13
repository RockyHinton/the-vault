import { expect, test, type Page } from "@playwright/test";
import { adminCredentials, memberCredentials, signIn } from "./support";

const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

/** Picks an option from a Radix select inside the open dialog. */
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("dialog").getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("people: producers and creatives persist with status, documents and shared visibility", async ({
  page,
  browser,
}) => {
  await signIn(page, adminCredentials);
  await page
    .getByRole("button", { name: "New Project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project Title").fill("Crewed Up");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByText("Crewed Up", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  const projectUrl = page.url();

  // Producers: add a profile with contact and initial status.
  await page.goto(`${projectUrl}/producers`);
  await expect(
    page.getByRole("heading", { name: "Producers", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Profile" }).click();
  await page.getByLabel("Full Name").fill("Sam Producer");
  await page.getByLabel("Company").fill("Rocket Productions");
  await page.getByLabel("Role", { exact: true }).fill("Lead Producer");
  await page.getByLabel("Contact 1 value").fill("sam@rocket.example");
  await page.getByRole("button", { name: "Save Profile" }).click();
  const card = page
    .getByTestId("person-card")
    .filter({ hasText: "Sam Producer" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Identified")).toBeVisible();
  await expect(card.getByText("Rocket Productions")).toBeVisible();

  // Open the profile: change status through the command, edit a field.
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Sam Producer" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Project Engagement" }).click();
  await choose(page, "Status", "Offered");
  await expect(
    dialog.getByText("Offered", { exact: true }).first(),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "Edit Profile" }).click();
  const editDialog = page
    .getByRole("dialog")
    .filter({ hasText: "Edit Producer Profile" });
  await editDialog.getByLabel("Company").fill("Rocket Productions Ltd");
  await editDialog.getByRole("button", { name: "Save Profile" }).click();
  await expect(editDialog).toBeHidden();
  await expect(dialog.getByText("Rocket Productions Ltd")).toBeVisible();

  // Attach a real document through the profile.
  await dialog.getByRole("button", { name: "Documents" }).click();
  await dialog.getByRole("button", { name: "Upload Document" }).click();
  await page.locator("#person-document-file").setInputFiles({
    name: "Deal Memo.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page.getByLabel("Title").fill("Deal Memo");
  await page.getByRole("button", { name: "Upload & Attach" }).click();
  const attached = dialog
    .getByTestId("person-document")
    .filter({ hasText: "Deal Memo" });
  await expect(attached).toBeVisible();
  await expect(attached.getByText("Deal Memo.pdf")).toBeVisible();
  await expect(
    attached.getByRole("link", { name: "Download Deal Memo" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Reload: the producer, its status and its document persist; the library has it too.
  await page.reload();
  const reloaded = page
    .getByTestId("person-card")
    .filter({ hasText: "Sam Producer" });
  await expect(reloaded).toBeVisible();
  await expect(reloaded.getByText("Offered")).toBeVisible();
  await reloaded.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Documents" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByTestId("person-document")
      .filter({ hasText: "Deal Memo" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`${projectUrl}/documents`);
  await expect(
    page.getByRole("row").filter({ hasText: "Deal Memo" }),
  ).toBeVisible();

  // Creatives: add a cast member.
  await page.goto(`${projectUrl}/creatives`);
  await page.getByRole("button", { name: "Add Creative" }).click();
  await page.getByLabel("Full Name").fill("Hiro Actor");
  await choose(page, "Role Type", "Cast");
  await page.getByLabel("Specific Role").fill("Detective Kaito");
  await page.getByLabel("Agent / Rep (optional)").fill("CAA");
  await page.getByLabel("Contact 1 value").fill("agent@caa.example");
  await page.getByRole("button", { name: "Save Profile" }).click();
  const creative = page
    .getByTestId("person-card")
    .filter({ hasText: "Hiro Actor" });
  await expect(creative).toBeVisible();
  await expect(creative.getByText("Cast", { exact: true })).toBeVisible();
  await expect(creative.getByText("CAA", { exact: true })).toBeVisible();

  // A second user sees the same people and documents, with role-appropriate controls.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, memberCredentials);
  await otherPage.goto(`${projectUrl}/producers`);
  const shared = otherPage
    .getByTestId("person-card")
    .filter({ hasText: "Sam Producer" });
  await expect(shared).toBeVisible();
  await shared.click();
  const sharedDialog = otherPage.getByRole("dialog");
  await expect(
    sharedDialog.getByRole("button", { name: "Edit Profile" }),
  ).toBeVisible();
  // Not the creator and not an admin: no delete, no detach.
  await expect(
    sharedDialog.getByRole("button", { name: "Delete Profile" }),
  ).toHaveCount(0);
  await sharedDialog.getByRole("button", { name: "Documents" }).click();
  await expect(
    sharedDialog
      .getByTestId("person-document")
      .filter({ hasText: "Deal Memo" }),
  ).toBeVisible();
  await expect(
    sharedDialog.getByRole("button", { name: "Detach Deal Memo" }),
  ).toHaveCount(0);
  await otherPage.goto(`${projectUrl}/creatives`);
  await expect(
    otherPage.getByTestId("person-card").filter({ hasText: "Hiro Actor" }),
  ).toBeVisible();
  await other.close();
});

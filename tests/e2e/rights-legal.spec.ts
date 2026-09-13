import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { adminCredentials, memberCredentials, signIn } from "./support";

const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

/** Picks an option from a Radix select whose trigger is labelled `label` (required marks included). */
async function choose(page: Page, label: string, option: string) {
  await page
    .getByRole("combobox", { name: new RegExp(`^${label}( \\*)?$`) })
    .click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function uploadAndAttach(page: Page, name: string, title: string) {
  await page.getByRole("button", { name: "Upload Document" }).click();
  await page.locator("#owner-document-file").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page.locator("#owner-document-title").fill(title);
  await page.getByRole("button", { name: "Upload & Attach" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("rights and legal records persist with documents, status and shared visibility", async ({
  page,
  browser,
}) => {
  await signIn(page, adminCredentials);
  await page
    .getByRole("button", { name: "New Project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project Title").fill("Cleared Title");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByText("Cleared Title", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  const projectUrl = page.url();

  // Underlying Rights: nothing is seeded; create, edit, attach, change status.
  await page.goto(`${projectUrl}/underlying-rights`);
  await expect(
    page.getByRole("heading", { name: "Underlying Rights" }),
  ).toBeVisible();
  await expect(page.getByText("No rights items yet")).toBeVisible();
  await page.getByRole("button", { name: "Add Rights Item" }).click();
  await expect(page.getByTestId("text-selected-rights-item")).toHaveText(
    "Original",
  );
  await choose(page, "Rights Type", "Book");
  await page.getByLabel("Rights Holder").fill("Harbour Press");
  await page.getByLabel("Expiry Date").fill("2027-06-30");
  await page.getByRole("button", { name: "Save Item" }).click();
  await expect(page.getByTestId("text-selected-rights-item")).toHaveText(
    "Book",
  );
  await uploadAndAttach(page, "Option Agreement.pdf", "Option Agreement");
  const rightsDoc = page
    .getByTestId("rights-document")
    .filter({ hasText: "Option Agreement" });
  await expect(rightsDoc).toBeVisible();
  await choose(page, "Status", "Optioned");
  await expect(page.getByTestId("badge-selected-rights-status")).toHaveText(
    "Optioned",
  );
  await expect(page.getByTestId("badge-rights-status")).toHaveText("Cleared");

  await page.reload();
  await expect(page.getByTestId("text-selected-rights-item")).toHaveText(
    "Book",
  );
  await expect(page.getByLabel("Rights Holder")).toHaveValue("Harbour Press");
  await expect(page.getByTestId("badge-selected-rights-status")).toHaveText(
    "Optioned",
  );
  await expect(
    page.getByTestId("rights-document").filter({ hasText: "Option Agreement" }),
  ).toBeVisible();

  // Documentation: the overview is empty until a record exists.
  await page.goto(`${projectUrl}/legal`);
  await expect(
    page.getByRole("heading", { name: "Documentation" }),
  ).toBeVisible();
  const writersCard = page
    .getByTestId("legal-category-card")
    .filter({ hasText: "Writer Agreements" });
  await expect(writersCard.getByText("No entities yet")).toBeVisible();
  await writersCard.click();
  await expect(
    page.getByRole("heading", { name: "Writer Agreements" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Writer" }).first().click();
  await page.getByLabel("Writer name").fill("Ada Writer");
  await choose(page, "Role", "Co-writer");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByRole("button", { name: "Create Entity" }).click();
  const record = page
    .getByTestId("legal-record")
    .filter({ hasText: "Ada Writer" });
  await expect(record).toBeVisible();
  await expect(record.getByText("Pending")).toBeVisible();
  await record.getByRole("button", { name: /Ada Writer/ }).click();
  await uploadAndAttach(page, "Writer Agreement.pdf", "Writer Agreement");
  const legalDoc = record
    .getByTestId("legal-document")
    .filter({ hasText: "Writer Agreement" });
  await expect(legalDoc).toBeVisible();
  await legalDoc.getByLabel("Status of Writer Agreement").click();
  await page.getByRole("option", { name: "Signed", exact: true }).click();
  await expect(record.getByText("Confirmed")).toBeVisible();

  await page.reload();
  const reloaded = page
    .getByTestId("legal-record")
    .filter({ hasText: "Ada Writer" });
  await expect(reloaded.getByText("Confirmed")).toBeVisible();
  await page.goto(`${projectUrl}/legal`);
  await expect(
    page
      .getByTestId("legal-category-card")
      .filter({ hasText: "Writer Agreements" })
      .getByText("Completed"),
  ).toBeVisible();

  // A second user sees the shared state; the attached bytes download intact.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, memberCredentials);
  await otherPage.goto(`${projectUrl}/underlying-rights`);
  await expect(
    otherPage.getByTestId("badge-selected-rights-status"),
  ).toHaveText("Optioned");
  const sharedDoc = otherPage
    .getByTestId("rights-document")
    .filter({ hasText: "Option Agreement" });
  await expect(sharedDoc).toBeVisible();
  // Not the creator and not an admin: no detach or delete controls.
  await expect(
    sharedDoc.getByRole("button", { name: "Detach Option Agreement" }),
  ).toHaveCount(0);
  await expect(
    otherPage.getByRole("button", { name: "Remove item" }),
  ).toHaveCount(0);
  const downloadPromise = otherPage.waitForEvent("download");
  await sharedDoc
    .getByRole("link", { name: "Download Option Agreement" })
    .click();
  const download = await downloadPromise;
  const bytes = await readFile((await download.path())!);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    createHash("sha256").update(pdf).digest("hex"),
  );
  await otherPage.goto(`${projectUrl}/legal/writer-agreements`);
  const sharedRecord = otherPage
    .getByTestId("legal-record")
    .filter({ hasText: "Ada Writer" });
  await expect(sharedRecord.getByText("Confirmed")).toBeVisible();
  // Document status belongs to its uploader (the admin): the member sees it but cannot edit it.
  await sharedRecord.getByRole("button", { name: /Ada Writer/ }).click();
  const sharedLegalDoc = sharedRecord
    .getByTestId("legal-document")
    .filter({ hasText: "Writer Agreement" });
  await expect(
    sharedLegalDoc.getByText("Signed", { exact: true }),
  ).toBeVisible();
  await expect(
    sharedLegalDoc.getByLabel("Status of Writer Agreement"),
  ).toHaveCount(0);
  await other.close();
});

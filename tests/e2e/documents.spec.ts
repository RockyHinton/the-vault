import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { adminCredentials, memberCredentials, signIn } from "./support";

const fixture = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test("document library: upload, persist, download byte-identical, visible to another session", async ({
  page,
  browser,
}) => {
  // 1-2. Admin signs in and creates a project through the UI.
  await signIn(page, adminCredentials);
  await page
    .getByRole("button", { name: "New Project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project Title").fill("Library Project");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByText("Library Project", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  const projectUrl = page.url();

  // 3. Open Documents.
  await page.getByText("Documents", { exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await expect(page.getByText("No documents yet")).toBeVisible();

  // 4-5. Upload a real file and see it.
  await page.getByRole("button", { name: "Upload Document" }).click();
  await page.locator("#document-file").setInputFiles({
    name: "Option Agreement.pdf",
    mimeType: "application/pdf",
    buffer: fixture,
  });
  await page.getByLabel("Title").fill("Option Agreement");
  await page.getByRole("button", { name: "Upload File" }).click();
  const row = page.getByRole("row").filter({ hasText: "Option Agreement" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Option Agreement.pdf")).toBeVisible();
  await expect(row.getByText("v1", { exact: true })).toBeVisible();

  // 6-7. Reload; still there.
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "Option Agreement" }),
  ).toBeVisible();

  // 8-9. Download and compare bytes.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download Option Agreement" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Option Agreement.pdf");
  const downloaded = await readFile((await download.path())!);
  expect(Buffer.compare(downloaded, fixture)).toBe(0);
  expect(createHash("sha256").update(downloaded).digest("hex")).toBe(
    createHash("sha256").update(fixture).digest("hex"),
  );

  // 10. A second authenticated browser context, as the ordinary user, sees it.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, memberCredentials);
  await otherPage.goto(`${projectUrl}/documents`);
  await expect(
    otherPage.getByRole("row").filter({ hasText: "Option Agreement" }),
  ).toBeVisible();
  // The ordinary user cannot delete the admin's document, but can download it.
  await expect(
    otherPage.getByRole("button", { name: "Delete Option Agreement" }),
  ).toHaveCount(0);
  await expect(
    otherPage.getByRole("link", { name: "Download Option Agreement" }),
  ).toBeVisible();
  await other.close();

  // New version keeps the lineage: v2 appears, v1 no longer listed as current.
  await page
    .getByRole("button", { name: "New version of Option Agreement" })
    .click();
  await page.locator("#document-file").setInputFiles({
    name: "Option Agreement v2.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat([fixture, Buffer.from("% revised\n")]),
  });
  await page.getByRole("button", { name: "Upload version" }).click();
  const current = page.getByRole("row").filter({ hasText: "Option Agreement" });
  await expect(current).toHaveCount(1);
  await expect(current.getByText("v2", { exact: true })).toBeVisible();
  await expect(current.getByText("Option Agreement v2.pdf")).toBeVisible();
});

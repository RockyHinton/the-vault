import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { buildPdf } from "../support/pdf-fixture";
import { adminCredentials, memberCredentials, signIn } from "./support";

const v1 = buildPdf([
  "HARBOUR LIGHTS - FIRST DRAFT",
  "INT. HARBOUR - NIGHT",
  "EXT. PIER - DAWN",
]);
const v2 = buildPdf([
  "HARBOUR LIGHTS - SECOND DRAFT",
  "INT. HARBOUR - NIGHT (REVISED)",
]);
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function uploadScript(
  page: Page,
  name: string,
  bytes: Buffer,
  title?: string,
) {
  await page
    .locator("#script-file")
    .setInputFiles({ name, mimeType: "application/pdf", buffer: bytes });
  if (title) await page.locator("#script-title").fill(title);
  await page
    .getByRole("button", { name: title ? "Upload Script" : "Upload Version" })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("scripts: real upload, real reader, exact-version notes, version history and shared access", async ({
  page,
  browser,
}) => {
  await signIn(page, adminCredentials);
  await page
    .getByRole("button", { name: "New Project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project Title").fill("Harbour Lights");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByText("Harbour Lights", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  const projectUrl = page.url();

  // Upload the first draft as the project's script.
  await page.goto(`${projectUrl}/script`);
  await expect(page.getByText("No Script Uploaded")).toBeVisible();
  await page.getByRole("button", { name: "Upload First Draft" }).click();
  await uploadScript(page, "Harbour Lights v1.pdf", v1, "Harbour Lights");
  await expect(page.getByTestId("script-current-version")).toHaveText("v1");
  await expect(page.getByText("No previous versions yet.")).toBeVisible();

  // The reader renders the real PDF: three pages, page 1 first.
  await page.getByRole("button", { name: "Open Script Reader" }).click();
  await expect(page).toHaveURL(/\/script-reader\//);
  await expect(page.getByTestId("reader-version-badge")).toContainText("v1");
  await expect(page.getByTestId("reader-page-indicator")).toHaveText(
    "Page 1 of 3",
  );
  const readerUrlV1 = page.url();

  // Click the page to place a note on version 1.
  await page.getByTestId("reader-page").click({ position: { x: 300, y: 200 } });
  await page
    .getByLabel("Note text")
    .fill("Opening image lands. Keep the harbour fog.");
  await page.getByRole("button", { name: "Save Note" }).click();
  const note = page
    .getByTestId("script-note")
    .filter({ hasText: "harbour fog" });
  await expect(note).toBeVisible();
  await expect(page.getByTestId("reader-annotation-marker")).toHaveCount(1);

  // Reload: script and note persist.
  await page.reload();
  await expect(page.getByTestId("reader-page-indicator")).toHaveText(
    "Page 1 of 3",
  );
  await expect(
    page.getByTestId("script-note").filter({ hasText: "harbour fog" }),
  ).toBeVisible();

  // Upload version 2; v1 stays readable with its note, v2 has none.
  await page.goto(`${projectUrl}/script`);
  await page.getByRole("button", { name: "Upload New Version" }).click();
  await uploadScript(page, "Harbour Lights v2.pdf", v2);
  await expect(page.getByTestId("script-current-version")).toHaveText("v2");
  const v1Row = page
    .getByTestId("script-version-row")
    .filter({ hasText: "v1" });
  await expect(v1Row).toBeVisible();
  await page.getByRole("button", { name: "Open Script Reader" }).click();
  await expect(page.getByTestId("reader-version-badge")).toContainText(
    "v2 · current",
  );
  await expect(page.getByTestId("reader-page-indicator")).toHaveText(
    "Page 1 of 2",
  );
  await expect(page.getByTestId("script-note")).toHaveCount(0);
  await page.goto(readerUrlV1);
  await expect(page.getByTestId("reader-version-badge")).toContainText(
    "v1 · earlier version",
  );
  await expect(
    page.getByTestId("script-note").filter({ hasText: "harbour fog" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open current version" }),
  ).toBeVisible();

  // A second user sees the history, reads v1, cannot delete the admin's note, and downloads exact bytes.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, memberCredentials);
  await otherPage.goto(`${projectUrl}/script`);
  await expect(otherPage.getByTestId("script-current-version")).toHaveText(
    "v2",
  );
  await expect(
    otherPage.getByRole("button", { name: "Remove Script" }),
  ).toHaveCount(0);
  await otherPage
    .getByTestId("script-version-row")
    .filter({ hasText: "v1" })
    .getByRole("button", { name: "Read v1" })
    .click();
  await expect(otherPage.getByTestId("reader-page-indicator")).toHaveText(
    "Page 1 of 3",
  );
  const sharedNote = otherPage
    .getByTestId("script-note")
    .filter({ hasText: "harbour fog" });
  await expect(sharedNote).toBeVisible();
  await sharedNote.hover();
  await expect(
    sharedNote.getByRole("button", { name: "Delete note" }),
  ).toHaveCount(0);
  // The member can add their own note to v1.
  await otherPage
    .getByTestId("reader-page")
    .click({ position: { x: 300, y: 500 } });
  await otherPage
    .getByLabel("Note text")
    .fill("Pier scene could open on the gulls.");
  await otherPage.getByRole("button", { name: "Save Note" }).click();
  await expect(otherPage.getByTestId("script-note")).toHaveCount(2);
  await otherPage.goto(`${projectUrl}/script`);
  const downloadPromise = otherPage.waitForEvent("download");
  await otherPage.getByRole("link", { name: "Download version 1" }).click();
  const download = await downloadPromise;
  const bytes = await readFile((await download.path())!);
  expect(sha(bytes)).toBe(sha(v1));
  await other.close();
});

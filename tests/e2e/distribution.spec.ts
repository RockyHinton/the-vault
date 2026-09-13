import { expect, test, type Page } from "@playwright/test";
import { adminCredentials, memberCredentials, signIn } from "./support";

const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

const card = (page: Page, name: string) =>
  page.locator(`[data-testid="territory-card"][data-territory-name="${name}"]`);

test("distribution: territories persist with status, notes, deal information and real documents across users", async ({
  page,
  browser,
}) => {
  await signIn(page, adminCredentials);
  await page
    .getByRole("button", { name: "New Project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project Title").fill("Sold Worldwide");
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByText("Sold Worldwide", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit metadata" }),
  ).toBeVisible();
  const projectUrl = page.url();
  const projectId = projectUrl.split("/project/")[1]!.split("/")[0]!;

  // Create a territory and open its workspace.
  await page.goto(`${projectUrl}/distribution`);
  await expect(page.getByText("No territories yet")).toBeVisible();
  await page.getByRole("button", { name: "New Territory" }).click();
  await page.getByLabel("New territory name").fill("United Kingdom");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(card(page, "United Kingdom")).toBeVisible();
  await expect(page.getByTestId("territory-count-total")).toHaveText("1");
  await expect(page.getByTestId("territory-count-available")).toHaveText("1");
  await card(page, "United Kingdom").click();
  await expect(
    page.getByRole("heading", { name: "United Kingdom" }),
  ).toBeVisible();

  // Deal information saves as a set; status moves through its command.
  await page.getByLabel("Distributor").fill("Studio Canal");
  await page.getByLabel("Signature Payment").fill("20% on signature");
  await page
    .getByLabel("General Notes")
    .fill("Exclusive theatrical, 15 years.");
  await page.getByRole("button", { name: "Save Changes" }).first().click();
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(
    0,
  );
  await page.getByRole("combobox", { name: "Territory status" }).click();
  await page.getByRole("option", { name: "In Discussion" }).click();
  await expect(
    page.getByRole("combobox", { name: "Territory status" }),
  ).toHaveText("In Discussion");

  // A note and a real document.
  await page.getByLabel("New note").fill("Met the buyer at Cannes.");
  await page.getByRole("button", { name: "Add Note" }).click();
  await expect(page.getByTestId("territory-note")).toHaveCount(1);
  await page.getByRole("button", { name: "Upload Document" }).click();
  await page.locator("#owner-document-file").setInputFiles({
    name: "UK Distribution Agreement.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page.locator("#owner-document-title").fill("UK Distribution Agreement");
  await page.getByRole("button", { name: "Upload & Attach" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByTestId("territory-document")).toHaveCount(1);

  // Reload: the grid and the workspace are served from PostgreSQL.
  await page.reload();
  await expect(card(page, "United Kingdom")).toBeVisible();
  await expect(
    card(page, "United Kingdom").getByTestId("territory-status"),
  ).toHaveText("In Discussion");
  await expect(card(page, "United Kingdom")).toContainText("1 doc");
  await expect(card(page, "United Kingdom")).toContainText("1 note");
  await expect(page.getByTestId("territory-count-discussion")).toHaveText("1");
  await card(page, "United Kingdom").click();
  await expect(page.getByLabel("Distributor")).toHaveValue("Studio Canal");
  await expect(page.getByLabel("Signature Payment")).toHaveValue(
    "20% on signature",
  );
  await expect(page.getByTestId("territory-note")).toContainText(
    "Met the buyer at Cannes.",
  );

  // The attached document downloads byte-identical through the private files route.
  const territories = (
    await (
      await page.request.get(
        `/api/v1/projects/${projectId}/distribution/territories`,
      )
    ).json()
  ).data as {
    items: { id: string; version: number }[];
  };
  const territoryId = territories.items[0]!.id;
  const detail = (
    await (
      await page.request.get(
        `/api/v1/projects/${projectId}/distribution/territories/${territoryId}`,
      )
    ).json()
  ).data as {
    documents: { file: { id: string } }[];
  };
  const download = await page.request.get(
    `/api/v1/files/${detail.documents[0]!.file.id}/content`,
  );
  expect(download.status()).toBe(200);
  expect(Buffer.from(await download.body()).equals(pdf)).toBe(true);

  // A second, ordinary user shares the state, edits collaboratively, and is refused a deletion.
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, memberCredentials);
  await otherPage.goto(`${projectUrl}/distribution`);
  await expect(
    card(otherPage, "United Kingdom").getByTestId("territory-status"),
  ).toHaveText("In Discussion");
  await card(otherPage, "United Kingdom").click();
  await expect(otherPage.getByLabel("Distributor")).toHaveValue("Studio Canal");
  await otherPage.getByLabel("Contact").fill("Ana Sales");
  await otherPage.getByRole("button", { name: "Save Changes" }).first().click();
  await expect(
    otherPage.getByRole("button", { name: "Save Changes" }),
  ).toHaveCount(0);
  await expect(
    otherPage.getByRole("button", { name: "Delete note" }),
  ).toHaveCount(0);
  await expect(otherPage.getByRole("button", { name: /^Detach/ })).toHaveCount(
    0,
  );
  const fresh = (
    await (
      await otherPage.request.get(
        `/api/v1/projects/${projectId}/distribution/territories/${territoryId}`,
      )
    ).json()
  ).data as {
    version: number;
  };
  const refused = await otherPage.request.delete(
    `/api/v1/projects/${projectId}/distribution/territories/${territoryId}`,
    { data: { version: fresh.version } },
  );
  expect(refused.status()).toBe(403);
  await otherContext.close();

  // The admin sees the member's edit after a refresh.
  await page.reload();
  await card(page, "United Kingdom").click();
  await expect(page.getByLabel("Contact")).toHaveValue("Ana Sales");
});

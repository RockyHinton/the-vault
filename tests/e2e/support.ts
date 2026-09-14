import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { adminCredentials, memberCredentials } from "../support/test-context";

export { adminCredentials, memberCredentials };

/** One API call as the signed-in browser user; fails the test on an unexpected status. */
async function api<T>(
  request: APIRequestContext,
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  data?: object,
): Promise<T> {
  const response = await request.fetch(`/api/v1${path}`, { method, data });
  expect(
    response.ok(),
    `${method} ${path} → ${response.status()} ${await response.text()}`,
  ).toBe(true);
  return (await response.json()).data as T;
}

/** Real server state meeting the Evaluation decision checklist. */
export async function meetEvaluationGates(
  request: APIRequestContext,
  projectId: string,
) {
  const evaluation = await api<{ version: number }>(
    request,
    "GET",
    `/projects/${projectId}/evaluation`,
  );
  await api(request, "PUT", `/projects/${projectId}/evaluation`, {
    writer: null,
    director: null,
    plannedBudget: null,
    financeTypes: [],
    gates: {
      scriptApproved: true,
      budgetApproved: true,
      financeApproved: true,
      talentAttached: true,
    },
    version: evaluation.version,
  });
}

/**
 * Real server state meeting Development → Production readiness: a locked,
 * fully funded budget, a signed chain of title and a committed cast member.
 */
export async function meetProductionReadiness(
  request: APIRequestContext,
  projectId: string,
) {
  const base = `/projects/${projectId}`;
  type Version = { id: string; version: number; departments: { id: string }[] };
  const budget = await api<{ currentVersion: Version }>(
    request,
    "POST",
    `${base}/budget`,
    { currency: "GBP" },
  );
  const versionId = budget.currentVersion.id;
  await api(
    request,
    "POST",
    `${base}/budget/departments/${budget.currentVersion.departments[0]!.id}/line-items`,
    { name: "Principal photography", amount: "1000.00" },
  );
  const draft = await api<{ currentVersion: Version }>(
    request,
    "GET",
    `${base}/budget`,
  );
  const submitted = await api<{ currentVersion: Version }>(
    request,
    "POST",
    `${base}/budget/versions/${versionId}/submit`,
    { version: draft.currentVersion.version },
  );
  await api(request, "POST", `${base}/budget/versions/${versionId}/lock`, {
    version: submitted.currentVersion.version,
  });
  await api(request, "POST", `${base}/finance-plan`, {
    budgetVersionId: versionId,
  });
  const plan = await api<{ sources: { id: string; version: number }[] }>(
    request,
    "POST",
    `${base}/finance-plan/sources`,
    { name: "Studio equity", type: "equity", amount: "1000.00" },
  );
  await api(
    request,
    "POST",
    `${base}/finance-plan/sources/${plan.sources[0]!.id}/approve`,
    { version: plan.sources[0]!.version },
  );
  const record = await api<{ id: string }>(
    request,
    "POST",
    `${base}/legal-records`,
    {
      name: "Original screenplay",
      details: {
        category: "chain_of_title",
        holder: "Studio",
        rightsType: "Original Screenplay",
      },
    },
  );
  const staged = await request.post("/api/v1/files", {
    headers: {
      "content-type": "application/octet-stream",
      "x-vault-filename": "chain-of-title.pdf",
    },
    data: Buffer.from("%PDF-1.4\n% chain of title\n%%EOF\n"),
  });
  expect(staged.status()).toBe(201);
  const attached = await api<{ documents: { id: string; version: number }[] }>(
    request,
    "POST",
    `${base}/legal-records/${record.id}/documents`,
    { fileObjectId: (await staged.json()).data.id, title: "Chain of title" },
  );
  await api(
    request,
    "PATCH",
    `${base}/documents/${attached.documents[0]!.id}`,
    {
      status: "signed",
      version: attached.documents[0]!.version,
    },
  );
  await api(request, "POST", `${base}/people`, {
    kind: "creative",
    name: "Lead Actor",
    roleTitle: "Lead",
    creativeRoleType: "cast",
    status: "confirmed",
  });
}

/** Signs in through the real Vault login form and waits for Projects. */
export async function signIn(
  page: Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

/** Signs out through the account menu and waits for the login page. */
export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

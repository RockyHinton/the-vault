import { expect } from "vitest";
import type { TestContext } from "./test-context";

type Agent = Awaited<ReturnType<TestContext["loginAs"]>>;

/**
 * Builds the real server state that satisfies a stage-readiness rule, through
 * the same API a studio would use. The stage-transition command reads this
 * state itself; nothing here tells it the project is ready.
 */

const projectPath = (projectId: string) => `/api/v1/projects/${projectId}`;

/** Evaluation → Development: every decision-checklist gate met (studio_admin). */
export async function meetEvaluationGates(admin: Agent, projectId: string) {
  const evaluation = await admin.get(`${projectPath(projectId)}/evaluation`);
  const saved = await admin.put(`${projectPath(projectId)}/evaluation`).send({
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
    version: evaluation.body.data.version,
  });
  expect(saved.status).toBe(200);
}

/** A GBP budget with one line item of `amount`, submitted and locked; returns the locked version id. */
export async function lockBudget(
  admin: Agent,
  projectId: string,
  amount: string,
): Promise<string> {
  const budget = `${projectPath(projectId)}/budget`;
  const created = await admin.post(budget).send({ currency: "GBP" });
  expect(created.status).toBe(201);
  const version = created.body.data.currentVersion;
  const lineItem = await admin
    .post(`${budget}/departments/${version.departments[0].id}/line-items`)
    .send({ name: "Principal photography", amount });
  expect(lineItem.status).toBe(201);
  const draft = (await admin.get(budget)).body.data.currentVersion;
  const submitted = await admin
    .post(`${budget}/versions/${version.id}/submit`)
    .send({ version: draft.version });
  expect(submitted.status).toBe(200);
  const locked = await admin
    .post(`${budget}/versions/${version.id}/lock`)
    .send({ version: submitted.body.data.currentVersion.version });
  expect(locked.status).toBe(200);
  return version.id as string;
}

export async function createFinancePlan(
  admin: Agent,
  projectId: string,
  budgetVersionId: string,
) {
  const created = await admin
    .post(`${projectPath(projectId)}/finance-plan`)
    .send({ budgetVersionId });
  expect(created.status).toBe(201);
}

/** Adds a source of `amount` and approves it (studio_admin). */
export async function addApprovedSource(
  admin: Agent,
  projectId: string,
  name: string,
  amount: string,
) {
  const plan = `${projectPath(projectId)}/finance-plan`;
  const added = await admin
    .post(`${plan}/sources`)
    .send({ name, type: "equity", amount });
  expect(added.status).toBe(201);
  const source = added.body.data.sources.find(
    (candidate: { name: string }) => candidate.name === name,
  );
  const approved = await admin
    .post(`${plan}/sources/${source.id}/approve`)
    .send({ version: source.version });
  expect(approved.status).toBe(200);
}

/** A chain-of-title record whose one attached document is signed. */
export async function completeChainOfTitle(admin: Agent, projectId: string) {
  const records = `${projectPath(projectId)}/legal-records`;
  const record = await admin.post(records).send({
    name: "Original screenplay",
    details: {
      category: "chain_of_title",
      holder: "Studio",
      rightsType: "Original Screenplay",
    },
  });
  expect(record.status).toBe(201);
  const file = await admin
    .post("/api/v1/files")
    .set("content-type", "application/octet-stream")
    .set("x-vault-filename", "Chain of title.pdf")
    .send(Buffer.from("%PDF-1.4\n% chain of title\n%%EOF\n"));
  expect(file.status).toBe(201);
  const attached = await admin
    .post(`${records}/${record.body.data.id}/documents`)
    .send({ fileObjectId: file.body.data.id, title: "Chain of title" });
  expect(attached.status).toBe(201);
  const [document] = attached.body.data.documents;
  const signed = await admin
    .patch(`${projectPath(projectId)}/documents/${document.id}`)
    .send({ status: "signed", version: document.version });
  expect(signed.status).toBe(200);
}

/** A cast member with a committed engagement. */
export async function commitCast(admin: Agent, projectId: string) {
  const person = await admin.post(`${projectPath(projectId)}/people`).send({
    kind: "creative",
    name: "Lead Actor",
    roleTitle: "Lead",
    creativeRoleType: "cast",
    status: "confirmed",
  });
  expect(person.status).toBe(201);
}

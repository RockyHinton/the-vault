import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sumMoney, summarizeFinancing } from "@shared/contracts";
import {
  adminCredentials,
  createTestContext,
  memberCredentials,
  type TestContext,
} from "../support/test-context";

type Agent = Awaited<ReturnType<TestContext["loginAs"]>>;

let context: TestContext;
let admin: Agent;
let member: Agent;
let projectId: string;
let otherProjectId: string;
let memberId: string;
let adminId: string;
/** Locked budget version 1 of `projectId`: total 1234567.89 GBP. */
let lockedVersionId: string;
/** Version 2 of the same budget, still a draft. */
let draftVersionId: string;
/** Locked version 1 of `otherProjectId`. */
let foreignLockedVersionId: string;

const plan = (id = projectId) => `/api/v1/projects/${id}/finance-plan`;
const budget = (id = projectId) => `/api/v1/projects/${id}/budget`;
const auditActions = async (entityType: string, entityId: string) =>
  (
    await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at",
      [entityType, entityId],
    )
  ).rows as { action: string; metadata: Record<string, unknown> }[];
const stagePdf = async (agent: Agent, name: string) => {
  const response = await agent
    .post("/api/v1/files")
    .set("content-type", "application/octet-stream")
    .set("x-vault-filename", name)
    .send(Buffer.from(`%PDF-1.4\n% ${name}\n%%EOF\n`));
  expect(response.status).toBe(201);
  return response.body.data.id as string;
};

type Source = {
  id: string;
  name: string;
  amount: string;
  status: string;
  version: number;
  position: number;
  createdBy: { id: string };
  approvedBy: { id: string } | null;
  approvedAt: string | null;
  documents: { id: string; folder: string; title: string }[];
};
type Plan = {
  id: string;
  budgetVersionId: string;
  budgetVersionNumber: number;
  currency: string;
  version: number;
  summary: Record<string, string>;
  sources: Source[];
};
const current = async (agent: Agent = member): Promise<Plan> =>
  (await agent.get(plan())).body.data;
const sourceNamed = (data: Plan, name: string) =>
  data.sources.find((s) => s.name === name)!;

/** Builds and locks a budget version worth 1234567.89 for a project. */
async function lockBudget(
  id: string,
): Promise<{ lockedId: string; total: string }> {
  const created = await member.post(budget(id)).send({ currency: "GBP" });
  expect(created.status).toBe(201);
  const version = created.body.data.currentVersion;
  const production = version.departments.find(
    (d: { name: string }) => d.name === "Production",
  );
  for (const [name, amount] of [
    ["Camera", "0.10"],
    ["Grip", "0.20"],
    ["Colour", "1234567.59"],
  ]) {
    expect(
      (
        await member
          .post(`${budget(id)}/departments/${production.id}/line-items`)
          .send({ name, amount })
      ).status,
    ).toBe(201);
  }
  const submitted = await member
    .post(`${budget(id)}/versions/${version.id}/submit`)
    .send({
      version: (await member.get(budget(id))).body.data.currentVersion.version,
    });
  expect(submitted.status).toBe(200);
  const locked = await admin
    .post(`${budget(id)}/versions/${version.id}/lock`)
    .send({ version: submitted.body.data.currentVersion.version });
  expect(locked.status).toBe(200);
  expect(locked.body.data.currentVersion.total).toBe("1234567.89");
  return { lockedId: version.id, total: "1234567.89" };
}

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (await admin.post("/api/v1/projects").send({ title: "Financed" }))
    .body.data.id;
  otherProjectId = (
    await admin.post("/api/v1/projects").send({ title: "Elsewhere" })
  ).body.data.id;
  memberId = (await member.get("/api/v1/auth/me")).body.data.user.id;
  adminId = (await admin.get("/api/v1/auth/me")).body.data.user.id;
  lockedVersionId = (await lockBudget(projectId)).lockedId;
  foreignLockedVersionId = (await lockBudget(otherProjectId)).lockedId;
  const revision = await member.post(
    `${budget()}/versions/${lockedVersionId}/revisions`,
  );
  expect(revision.status).toBe(201);
  draftVersionId = revision.body.data.currentVersion.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("finance plan: provenance", () => {
  it("refuses a plan without a locked budget version of this project", async () => {
    expect((await member.get(plan())).status).toBe(404);
    const missing = await member
      .post(plan())
      .send({ budgetVersionId: "not-a-uuid" });
    expect(missing.status).toBe(400);
    const unknown = await member
      .post(plan())
      .send({ budgetVersionId: "00000000-0000-4000-8000-000000000000" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("BUDGET_VERSION_NOT_FOUND");
    const foreign = await member
      .post(plan())
      .send({ budgetVersionId: foreignLockedVersionId });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("BUDGET_VERSION_NOT_FOUND");
    const draft = await member
      .post(plan())
      .send({ budgetVersionId: draftVersionId });
    expect(draft.status).toBe(422);
    expect(draft.body.error.code).toBe("BUDGET_VERSION_NOT_LOCKED");
    expect((await member.get(plan())).status).toBe(404);
  });

  it("creates one plan per project against the exact locked version and derives its baseline from that version", async () => {
    const created = await member
      .post(plan())
      .send({ budgetVersionId: lockedVersionId, createdBy: { id: "spoofed" } });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      projectId,
      budgetVersionId: lockedVersionId,
      budgetVersionNumber: 1,
      currency: "GBP",
      createdBy: { id: memberId },
      version: 1,
      sources: [],
      summary: {
        budgetTotal: "1234567.89",
        approvedTotal: "0.00",
        committedTotal: "0.00",
        fundingGap: "1234567.89",
        overFinancedBy: "0.00",
      },
    });
    expect(created.body.data.createdBy).not.toHaveProperty("email");
    const again = await admin
      .post(plan())
      .send({ budgetVersionId: lockedVersionId });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("FINANCE_PLAN_EXISTS");
    expect(
      (await auditActions("finance_plan", created.body.data.id)).map(
        (r) => r.action,
      ),
    ).toEqual(["finance_plan.created"]);
    expect((await admin.get(plan(otherProjectId))).status).toBe(404);
  });

  it("the referenced budget total is stable while the open revision changes", async () => {
    const production = (
      await member.get(budget())
    ).body.data.currentVersion.departments.find(
      (d: { name: string }) => d.name === "Production",
    );
    expect(
      (
        await member
          .post(`${budget()}/departments/${production.id}/line-items`)
          .send({ name: "Extra in v2", amount: "500000" })
      ).status,
    ).toBe(201);
    expect((await current()).summary.budgetTotal).toBe("1234567.89");
    const columns = await context.database.client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name IN ('finance_plans','finance_sources') AND column_name ~ 'total|gap'",
    );
    expect(columns.rows).toEqual([]);
  });

  it("rebasing is studio_admin-only and requires a locked version of this project", async () => {
    const before = await current();
    const forbidden = await member
      .post(`${plan()}/budget-version`)
      .send({ budgetVersionId: draftVersionId, version: before.version });
    expect(forbidden.status).toBe(403);
    const draft = await admin
      .post(`${plan()}/budget-version`)
      .send({ budgetVersionId: draftVersionId, version: before.version });
    expect(draft.status).toBe(422);
    const foreign = await admin.post(`${plan()}/budget-version`).send({
      budgetVersionId: foreignLockedVersionId,
      version: before.version,
    });
    expect(foreign.status).toBe(404);
    const same = await admin
      .post(`${plan()}/budget-version`)
      .send({ budgetVersionId: lockedVersionId, version: before.version });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe("BUDGET_VERSION_UNCHANGED");
    expect((await current()).budgetVersionId).toBe(lockedVersionId);
    expect(
      (await auditActions("finance_plan", before.id)).map((r) => r.action),
    ).toEqual(["finance_plan.created"]);
  });
});

describe("finance plan: money and sources", () => {
  it("stores exact amounts, orders sources by position and derives every total in one shared calculation", async () => {
    for (const [name, amount, type] of [
      ["Angel equity", "0.10", "equity"],
      ["Second angel", "0.20", "equity"],
      ["Regional grant", "250000", "grant"],
      ["Tax credit", "999999999999.99", "tax_credit"],
    ]) {
      const created = await member
        .post(`${plan()}/sources`)
        .send({ name, amount, type, createdBy: { id: "spoofed" } });
      expect(created.status).toBe(201);
    }
    const data = await current();
    expect(
      data.sources.map((s) => [s.name, s.amount, s.status, s.position]),
    ).toEqual([
      ["Angel equity", "0.10", "targeted", 0],
      ["Second angel", "0.20", "targeted", 1],
      ["Regional grant", "250000.00", "targeted", 2],
      ["Tax credit", "999999999999.99", "targeted", 3],
    ]);
    expect(data.sources.every((s) => s.createdBy.id === memberId)).toBe(true);
    expect(data.summary).toEqual({
      budgetTotal: "1234567.89",
      targetedTotal: "1000000250000.29",
      softCommittedTotal: "0.00",
      approvedTotal: "0.00",
      committedTotal: "0.00",
      fundingGap: "1234567.89",
      overFinancedBy: "0.00",
    });
    expect(data.summary.targetedTotal).toBe(
      sumMoney(data.sources.map((s) => s.amount)),
    );
    expect(data.summary).toEqual(
      summarizeFinancing({
        budgetTotal: "1234567.89",
        sources: data.sources as never,
      }),
    );
  });

  it("rejects malformed money and PostgreSQL rejects negatives and blank names", async () => {
    for (const amount of ["1.234", "-5", "1e5", "abc", "", "1,000"]) {
      const response = await member
        .post(`${plan()}/sources`)
        .send({ name: "Bad", amount, type: "equity" });
      expect(response.status, amount).toBe(400);
    }
    const [{ id }] = (
      await context.database.client.query(
        "SELECT id FROM finance_plans LIMIT 1",
      )
    ).rows;
    await expect(
      context.database.client.query(
        "INSERT INTO finance_sources (finance_plan_id, name, type, amount, position, created_by_user_id) VALUES ($1, 'x', 'equity', -1, 99, $2)",
        [id, memberId],
      ),
    ).rejects.toThrow(/finance_sources_amount_non_negative/);
    await expect(
      context.database.client.query(
        "INSERT INTO finance_sources (finance_plan_id, name, type, amount, position, created_by_user_id) VALUES ($1, '  ', 'equity', 1, 99, $2)",
        [id, memberId],
      ),
    ).rejects.toThrow(/finance_sources_name_not_blank/);
  });

  it("edits are collaborative, compare-and-set and audited with the amount change", async () => {
    const source = sourceNamed(await current(), "Regional grant");
    const stale = await admin
      .patch(`${plan()}/sources/${source.id}`)
      .send({ amount: "300000", version: source.version + 5 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    const nothing = await admin
      .patch(`${plan()}/sources/${source.id}`)
      .send({ version: source.version });
    expect(nothing.status).toBe(400);
    const statusViaPatch = await admin
      .patch(`${plan()}/sources/${source.id}`)
      .send({ status: "approved", amount: "300000", version: source.version });
    expect(statusViaPatch.status).toBe(200);
    const edited = sourceNamed(statusViaPatch.body.data, "Regional grant");
    expect(edited).toMatchObject({
      amount: "300000.00",
      status: "targeted",
      version: source.version + 1,
    });
    const dated = await admin.patch(`${plan()}/sources/${source.id}`).send({
      expectedDate: "2026-11-30",
      notes: "Board meets in November",
      version: edited.version,
    });
    expect(dated.status).toBe(200);
    expect(sourceNamed(dated.body.data, "Regional grant")).toMatchObject({
      expectedDate: "2026-11-30",
      notes: "Board meets in November",
    });
    const badDate = await admin
      .patch(`${plan()}/sources/${source.id}`)
      .send({ expectedDate: "Q4 2026", version: edited.version + 1 });
    expect(badDate.status).toBe(400);
    const audit = await auditActions("finance_source", source.id);
    expect(audit.map((r) => r.action)).toEqual([
      "finance_source.created",
      "finance_source.updated",
      "finance_source.updated",
    ]);
    expect(audit[1].metadata).toMatchObject({
      fromAmount: "250000.00",
      toAmount: "300000.00",
    });
    expect((await current()).summary.targetedTotal).toBe("1000000300000.29");
  });

  it("a source is unreachable through another project", async () => {
    const source = sourceNamed(await current(), "Angel equity");
    expect(
      (
        await admin
          .patch(`${plan(otherProjectId)}/sources/${source.id}`)
          .send({ name: "Hijacked", version: source.version })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .post(`${plan(otherProjectId)}/sources/${source.id}/approve`)
          .send({ version: source.version })
      ).status,
    ).toBe(404);
  });
});

describe("finance plan: lifecycle", () => {
  it("targeted ⇄ soft committed is an explicit command; approval is refused to it", async () => {
    const source = sourceNamed(await current(), "Angel equity");
    const viaStatus = await member
      .post(`${plan()}/sources/${source.id}/status`)
      .send({ status: "approved", version: source.version });
    expect(viaStatus.status).toBe(400);
    const soft = await member
      .post(`${plan()}/sources/${source.id}/status`)
      .send({ status: "soft_committed", version: source.version });
    expect(soft.status).toBe(200);
    expect(sourceNamed(soft.body.data, "Angel equity")).toMatchObject({
      status: "soft_committed",
      version: source.version + 1,
      approvedBy: null,
    });
    expect(soft.body.data.summary).toMatchObject({
      softCommittedTotal: "0.10",
      approvedTotal: "0.00",
      fundingGap: "1234567.89",
    });
    const repeat = await member
      .post(`${plan()}/sources/${source.id}/status`)
      .send({ status: "soft_committed", version: source.version + 1 });
    expect(repeat.status).toBe(409);
    expect(repeat.body.error.code).toBe("STATUS_UNCHANGED");
  });

  it("only a studio_admin approves; approval records the approver, freezes the source and moves the gap", async () => {
    const source = sourceNamed(await current(), "Regional grant");
    const forbidden = await member
      .post(`${plan()}/sources/${source.id}/approve`)
      .send({ version: source.version });
    expect(forbidden.status).toBe(403);
    expect(sourceNamed(await current(), "Regional grant").status).toBe(
      "targeted",
    );
    const stale = await admin
      .post(`${plan()}/sources/${source.id}/approve`)
      .send({ version: source.version + 1 });
    expect(stale.status).toBe(409);
    const approved = await admin
      .post(`${plan()}/sources/${source.id}/approve`)
      .send({ version: source.version });
    expect(approved.status).toBe(200);
    const frozen = sourceNamed(approved.body.data, "Regional grant");
    expect(frozen).toMatchObject({
      status: "approved",
      approvedBy: { id: adminId },
      version: source.version + 1,
    });
    expect(frozen.approvedAt).not.toBeNull();
    expect(approved.body.data.summary).toMatchObject({
      approvedTotal: "300000.00",
      fundingGap: "934567.89",
      overFinancedBy: "0.00",
    });

    for (const attempt of [
      () =>
        admin
          .patch(`${plan()}/sources/${source.id}`)
          .send({ amount: "1", version: frozen.version }),
      () =>
        admin
          .post(`${plan()}/sources/${source.id}/status`)
          .send({ status: "targeted", version: frozen.version }),
      () =>
        admin
          .post(`${plan()}/sources/${source.id}/approve`)
          .send({ version: frozen.version }),
      () =>
        admin
          .delete(`${plan()}/sources/${source.id}`)
          .send({ version: frozen.version }),
    ]) {
      const response = await attempt();
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("FINANCE_SOURCE_APPROVED");
    }
    expect(sourceNamed(await current(), "Regional grant")).toMatchObject({
      amount: "300000.00",
      status: "approved",
      version: frozen.version,
    });
    const audit = await auditActions("finance_source", source.id);
    expect(audit.at(-1)).toMatchObject({
      action: "finance_source.approved",
      metadata: { from: "targeted", amount: "300000.00" },
    });
    expect(
      audit.filter((r) => r.action === "finance_source.approved"),
    ).toHaveLength(1);
  });

  it("PostgreSQL refuses approval columns that disagree with the status", async () => {
    const source = sourceNamed(await current(), "Angel equity");
    await expect(
      context.database.client.query(
        "UPDATE finance_sources SET status = 'approved' WHERE id = $1",
        [source.id],
      ),
    ).rejects.toThrow(/finance_sources_approval_matches_status/);
    await expect(
      context.database.client.query(
        "UPDATE finance_sources SET approved_by_user_id = $2, approved_at = now() WHERE id = $1",
        [source.id, adminId],
      ),
    ).rejects.toThrow(/finance_sources_approval_matches_status/);
  });

  it("over-financing is reported, never hidden, and the gap never goes negative", async () => {
    const credit = sourceNamed(await current(), "Tax credit");
    const approved = await admin
      .post(`${plan()}/sources/${credit.id}/approve`)
      .send({ version: credit.version });
    expect(approved.status).toBe(200);
    expect(approved.body.data.summary).toMatchObject({
      approvedTotal: "1000000299999.99",
      fundingGap: "0.00",
      overFinancedBy: "999999065432.10",
    });
  });

  it("removal is creator-or-admin, versioned and audited; approved sources are never removable", async () => {
    const adminOwned = await admin.post(`${plan()}/sources`).send({
      name: "Admin loan",
      amount: "10",
      type: "loan",
      status: "soft_committed",
    });
    expect(adminOwned.status).toBe(201);
    const loan = sourceNamed(adminOwned.body.data, "Admin loan");
    expect(loan.status).toBe("soft_committed");
    const forbidden = await member
      .delete(`${plan()}/sources/${loan.id}`)
      .send({ version: loan.version });
    expect(forbidden.status).toBe(403);
    const mine = sourceNamed(await current(), "Second angel");
    const stale = await member
      .delete(`${plan()}/sources/${mine.id}`)
      .send({ version: mine.version + 1 });
    expect(stale.status).toBe(409);
    const removed = await member
      .delete(`${plan()}/sources/${mine.id}`)
      .send({ version: mine.version });
    expect(removed.status).toBe(200);
    expect(removed.body.data.sources.map((s: Source) => s.name)).not.toContain(
      "Second angel",
    );
    expect((await auditActions("finance_source", mine.id)).at(-1)?.action).toBe(
      "finance_source.deleted",
    );
    const byAdmin = await admin
      .delete(`${plan()}/sources/${loan.id}`)
      .send({ version: loan.version });
    expect(byAdmin.status).toBe(200);
    expect((await current()).summary.targetedTotal).toBe("0.00");
  });
});

describe("finance plan: documents", () => {
  it("attaches a new document into the finance plan folder and detaches it; approved sources keep theirs", async () => {
    const angel = sourceNamed(await current(), "Angel equity");
    const attached = await member
      .post(`${plan()}/sources/${angel.id}/documents`)
      .send({
        fileObjectId: await stagePdf(member, "term-sheet.pdf"),
        title: "Term sheet",
        status: "draft",
      });
    expect(attached.status).toBe(201);
    const document = sourceNamed(attached.body.data, "Angel equity")
      .documents[0];
    expect(document).toMatchObject({
      folder: "financing/finance-plan",
      title: "Term sheet",
    });
    const twice = await member.put(
      `${plan()}/sources/${angel.id}/documents/${document.id}`,
    );
    expect(twice.status).toBe(409);
    const library = await member.get(
      `/api/v1/projects/${projectId}/documents?folder=financing/finance-plan`,
    );
    expect(library.body.data.items.map((d: { id: string }) => d.id)).toContain(
      document.id,
    );
    expect(
      (await auditActions("finance_source", angel.id)).at(-1)?.action,
    ).toBe("finance_source.document_attached");

    const grant = sourceNamed(await current(), "Regional grant");
    const onApproved = await admin
      .post(`${plan()}/sources/${grant.id}/documents`)
      .send({
        fileObjectId: await stagePdf(admin, "grant-letter.pdf"),
        title: "Grant letter",
        status: "final",
      });
    expect(onApproved.status).toBe(201);
    const letter = sourceNamed(onApproved.body.data, "Regional grant")
      .documents[0];
    const detachFromApproved = await admin.delete(
      `${plan()}/sources/${grant.id}/documents/${letter.id}`,
    );
    expect(detachFromApproved.status).toBe(409);
    expect(detachFromApproved.body.error.code).toBe("FINANCE_SOURCE_APPROVED");

    const otherCannotDetach = await admin
      .post(`${plan()}/sources/${angel.id}/documents`)
      .send({
        fileObjectId: await stagePdf(admin, "x.pdf"),
        title: "X",
        status: "draft",
      });
    expect(otherCannotDetach.status).toBe(201);
    const detachForbidden = await member.delete(
      `${plan()}/sources/${angel.id}/documents/${document.id}`,
    );
    expect(detachForbidden.status).toBe(200);
    expect(
      sourceNamed(detachForbidden.body.data, "Angel equity").documents.map(
        (d) => d.title,
      ),
    ).toEqual(["X"]);
    expect(
      (
        await member.get(
          `/api/v1/projects/${projectId}/documents/${document.id}`,
        )
      ).status,
    ).toBe(200);
  });
});

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sumMoney } from "@shared/contracts";
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
let lockedVersionId: string;
let draftVersionId: string;
let productionId: string;
let postId: string;
let otherProjectDepartmentId: string;
let approvedSourceId: string;
let targetedSourceId: string;

const cashFlow = (id = projectId) => `/api/v1/projects/${id}/cash-flow`;
const overview = (id = projectId) =>
  `/api/v1/projects/${id}/financing-overview`;
const budget = (id = projectId) => `/api/v1/projects/${id}/budget`;
const plan = (id = projectId) => `/api/v1/projects/${id}/finance-plan`;
const auditActions = async (entityType: string, entityId: string) =>
  (
    await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at",
      [entityType, entityId],
    )
  ).rows as { action: string; metadata: Record<string, unknown> }[];

type Period = {
  id: string;
  inflow: string;
  outflow: string;
  net: string;
  closingBalance: string;
};
type CashFlowData = {
  id: string;
  budgetVersionId: string;
  budgetVersionNumber: number;
  currency: string;
  timeframe: string;
  openingBalance: string;
  version: number;
  departments: {
    id: string;
    name: string;
    total: string;
    window: { startDate: string; endDate: string; version: number } | null;
    payments: {
      id: string;
      name: string;
      amount: string;
      direction: string;
      date: string;
      version: number;
      createdBy: { id: string };
    }[];
  }[];
  sources: {
    id: string;
    name: string;
    amount: string;
    expectedDate: string | null;
    scheduledDate: string | null;
    timing: { expectedDate: string; version: number } | null;
  }[];
  projection: {
    periods: Period[];
    totalInflow: string;
    totalOutflow: string;
    closingBalance: string;
    lowestBalance: string;
    firstShortfallPeriodId: string | null;
    unscheduledInflow: string;
    unscheduledOutflow: string;
    departmentOutflows: { departmentId: string; amount: string }[];
  };
};
const current = async (agent: Agent = member): Promise<CashFlowData> =>
  (await agent.get(cashFlow())).body.data;
const departmentNamed = (data: CashFlowData, name: string) =>
  data.departments.find((d) => d.name === name)!;
const periodOf = (data: CashFlowData, id: string) =>
  data.projection.periods.find((p) => p.id === id)!;

/** A GBP budget: Production 0.10 + 0.20, Post-Production 1234567.59, locked as version 1. */
async function lockBudget(id: string) {
  const created = await member.post(budget(id)).send({ currency: "GBP" });
  expect(created.status).toBe(201);
  const version = created.body.data.currentVersion;
  const production = version.departments.find(
    (d: { name: string }) => d.name === "Production",
  );
  const post = version.departments.find(
    (d: { name: string }) => d.name === "Post-Production",
  );
  for (const [department, name, amount] of [
    [production, "Camera", "0.10"],
    [production, "Grip", "0.20"],
    [post, "Colour", "1234567.59"],
  ] as const) {
    expect(
      (
        await member
          .post(`${budget(id)}/departments/${department.id}/line-items`)
          .send({ name, amount })
      ).status,
    ).toBe(201);
  }
  const fresh = (await member.get(budget(id))).body.data.currentVersion;
  const submitted = await member
    .post(`${budget(id)}/versions/${version.id}/submit`)
    .send({ version: fresh.version });
  expect(submitted.status).toBe(200);
  const locked = await admin
    .post(`${budget(id)}/versions/${version.id}/lock`)
    .send({ version: submitted.body.data.currentVersion.version });
  expect(locked.status).toBe(200);
  return {
    versionId: version.id as string,
    productionId: production.id as string,
    postId: post.id as string,
  };
}

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (
    await admin.post("/api/v1/projects").send({ title: "Scheduled" })
  ).body.data.id;
  otherProjectId = (
    await admin.post("/api/v1/projects").send({ title: "Elsewhere" })
  ).body.data.id;
  memberId = (await member.get("/api/v1/auth/me")).body.data.user.id;
  const locked = await lockBudget(projectId);
  lockedVersionId = locked.versionId;
  productionId = locked.productionId;
  postId = locked.postId;
  otherProjectDepartmentId = (await lockBudget(otherProjectId)).productionId;
});

afterAll(async () => {
  await context.destroy();
});

describe("cash flow: provenance", () => {
  it("needs a finance plan; the plan needs a locked budget", async () => {
    expect((await member.get(cashFlow())).status).toBe(404);
    const early = await member.post(cashFlow());
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe("FINANCE_PLAN_REQUIRED");
    const planCreated = await member
      .post(plan())
      .send({ budgetVersionId: lockedVersionId });
    expect(planCreated.status).toBe(201);
    const equity = await member.post(`${plan()}/sources`).send({
      name: "Equity",
      amount: "1000000.00",
      type: "equity",
      expectedDate: "2026-03-15",
    });
    approvedSourceId = equity.body.data.sources[0].id;
    const approved = await admin
      .post(`${plan()}/sources/${approvedSourceId}/approve`)
      .send({ version: equity.body.data.sources[0].version });
    expect(approved.status).toBe(200);
    const grant = await member
      .post(`${plan()}/sources`)
      .send({ name: "Grant", amount: "50.00", type: "grant" });
    targetedSourceId = grant.body.data.sources[1].id;
  });

  it("creates one cash flow per project bound to the plan's exact locked version, with derived departments and approved inflows only", async () => {
    const created = await member
      .post(cashFlow())
      .send({ createdBy: { id: "spoofed" }, openingBalance: "9" });
    expect(created.status).toBe(201);
    const data: CashFlowData = created.body.data;
    expect(data).toMatchObject({
      budgetVersionId: lockedVersionId,
      budgetVersionNumber: 1,
      currency: "GBP",
      timeframe: "monthly",
      openingBalance: "0.00",
      version: 1,
    });
    expect(created.body.data.createdBy).toMatchObject({ id: memberId });
    expect(data.departments.map((d) => [d.name, d.total, d.window])).toEqual([
      ["Above the Line", "0.00", null],
      ["Production", "0.30", null],
      ["Post-Production", "1234567.59", null],
      ["Other", "0.00", null],
      ["Contingency", "0.00", null],
    ]);
    expect(data.sources).toEqual([
      expect.objectContaining({
        id: approvedSourceId,
        amount: "1000000.00",
        expectedDate: "2026-03-15",
        scheduledDate: "2026-03-15",
        timing: null,
      }),
    ]);
    expect(data.projection.unscheduledOutflow).toBe("1234567.89");
    expect(data.projection.totalInflow).toBe("1000000.00");
    expect(periodOf(data, "2026-03").inflow).toBe("1000000.00");
    expect((await member.post(cashFlow())).status).toBe(409);
    expect(
      (await auditActions("cash_flow", data.id)).map((r) => r.action),
    ).toEqual(["cash_flow.created"]);
    expect((await admin.get(cashFlow(otherProjectId))).status).toBe(404);
    const columns = await context.database.client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name LIKE 'cash_flow%' AND column_name ~ 'balance|total|inflow|outflow'",
    );
    expect(
      columns.rows.map((r: { column_name: string }) => r.column_name),
    ).toEqual(["opening_balance"]);
  });

  it("refuses departments of another project or of a version the plan does not reference", async () => {
    const foreign = await member
      .put(`${cashFlow()}/departments/${otherProjectDepartmentId}/window`)
      .send({ startDate: "2026-01-01", endDate: "2026-01-31", version: 0 });
    expect(foreign.status).toBe(404);
    const revision = await member.post(
      `${budget()}/versions/${lockedVersionId}/revisions`,
    );
    expect(revision.status).toBe(201);
    draftVersionId = revision.body.data.currentVersion.id;
    const draftProduction = revision.body.data.currentVersion.departments.find(
      (d: { name: string }) => d.name === "Production",
    );
    const unreferenced = await member
      .put(`${cashFlow()}/departments/${draftProduction.id}/window`)
      .send({ startDate: "2026-01-01", endDate: "2026-01-31", version: 0 });
    expect(unreferenced.status).toBe(422);
    expect(unreferenced.body.error.code).toBe(
      "DEPARTMENT_NOT_IN_REFERENCED_VERSION",
    );
    const payment = await member.post(`${cashFlow()}/payments`).send({
      departmentId: draftProduction.id,
      name: "Late",
      amount: "1",
      direction: "outflow",
      date: "2026-01-05",
    });
    expect(payment.status).toBe(422);
  });

  it("the draft revision's edits never reach the schedule", async () => {
    const draft = (await member.get(budget())).body.data.currentVersion;
    expect(draft.id).toBe(draftVersionId);
    const production = draft.departments.find(
      (d: { name: string }) => d.name === "Production",
    );
    expect(
      (
        await member
          .post(`${budget()}/departments/${production.id}/line-items`)
          .send({ name: "Extra", amount: "500000" })
      ).status,
    ).toBe(201);
    const data = await current();
    expect(departmentNamed(data, "Production").total).toBe("0.30");
    expect(data.budgetVersionId).toBe(lockedVersionId);
  });
});

describe("cash flow: timing and money", () => {
  it("spend windows spread the locked department total exactly by day; version 0 creates, the current version replaces", async () => {
    const set = await member
      .put(`${cashFlow()}/departments/${postId}/window`)
      .send({ startDate: "2026-04-01", endDate: "2026-06-30", version: 0 });
    expect(set.status).toBe(200);
    const data: CashFlowData = set.body.data;
    const post = departmentNamed(data, "Post-Production");
    expect(post.window).toMatchObject({
      startDate: "2026-04-01",
      endDate: "2026-06-30",
      version: 1,
    });
    const scheduled = data.projection.periods.filter(
      (p) => p.outflow !== "0.00",
    );
    expect(scheduled.map((p) => p.id)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    expect(sumMoney(scheduled.map((p) => p.outflow))).toBe("1234567.59");
    // 91 days: April is 30 of them: floor(123456759 × 30 ÷ 91) cents.
    expect(periodOf(data, "2026-04").outflow).toBe("407000.30");
    expect(data.projection.unscheduledOutflow).toBe("0.30");
    expect(data.projection.departmentOutflows).toEqual([
      { departmentId: postId, amount: "1234567.59" },
    ]);

    const duplicateCreate = await member
      .put(`${cashFlow()}/departments/${postId}/window`)
      .send({ startDate: "2026-04-01", endDate: "2026-06-30", version: 0 });
    expect(duplicateCreate.status).toBe(409);
    const stale = await member
      .put(`${cashFlow()}/departments/${postId}/window`)
      .send({ startDate: "2026-04-01", endDate: "2026-04-30", version: 5 });
    expect(stale.status).toBe(409);
    const inverted = await member
      .put(`${cashFlow()}/departments/${postId}/window`)
      .send({ startDate: "2026-04-30", endDate: "2026-04-01", version: 1 });
    expect(inverted.status).toBe(400);
    const replaced = await admin
      .put(`${cashFlow()}/departments/${postId}/window`)
      .send({ startDate: "2026-04-01", endDate: "2026-04-30", version: 1 });
    expect(replaced.status).toBe(200);
    expect(periodOf(replaced.body.data, "2026-04").outflow).toBe("1234567.59");
    expect(
      departmentNamed(replaced.body.data, "Post-Production").window?.version,
    ).toBe(2);
    await expect(
      context.database.client.query(
        "UPDATE cash_flow_department_windows SET end_date = '2026-03-01' WHERE budget_department_id = $1",
        [postId],
      ),
    ).rejects.toThrow(/cash_flow_department_windows_end_after_start/);
    const audit = await auditActions("cash_flow", data.id);
    expect(audit.map((r) => r.action)).toEqual([
      "cash_flow.created",
      "cash_flow_department_window.set",
      "cash_flow_department_window.set",
    ]);
    expect(audit[2].metadata).toMatchObject({
      from: { startDate: "2026-04-01", endDate: "2026-06-30" },
      to: { startDate: "2026-04-01", endDate: "2026-04-30" },
    });
  });

  it("payments are exact, dated, positive, collaborative to edit and creator-or-admin to remove", async () => {
    for (const amount of ["0", "-1", "1.234", "abc"]) {
      const bad = await member.post(`${cashFlow()}/payments`).send({
        departmentId: productionId,
        name: "Bad",
        amount,
        direction: "outflow",
        date: "2026-02-10",
      });
      expect(bad.status, amount).toBe(400);
    }
    const first = await member.post(`${cashFlow()}/payments`).send({
      departmentId: productionId,
      name: "Camera deposit",
      amount: "0.10",
      direction: "outflow",
      date: "2026-02-10",
    });
    expect(first.status).toBe(201);
    const second = await admin.post(`${cashFlow()}/payments`).send({
      departmentId: productionId,
      name: "Rebate",
      amount: "0.20",
      direction: "inflow",
      date: "2026-02-20",
    });
    expect(second.status).toBe(201);
    const data: CashFlowData = second.body.data;
    const february = periodOf(data, "2026-02");
    expect(february).toMatchObject({
      inflow: "0.20",
      outflow: "0.10",
      net: "0.10",
    });
    const production = departmentNamed(data, "Production");
    expect(
      production.payments.map((p) => [p.name, p.amount, p.direction]),
    ).toEqual([
      ["Camera deposit", "0.10", "outflow"],
      ["Rebate", "0.20", "inflow"],
    ]);
    const mine = production.payments[0];
    const theirs = production.payments[1];
    const edited = await admin.patch(`${cashFlow()}/payments/${mine.id}`).send({
      amount: "999999999999.99",
      date: "2026-02-11",
      version: mine.version,
    });
    expect(edited.status).toBe(200);
    expect(periodOf(edited.body.data, "2026-02").outflow).toBe(
      "999999999999.99",
    );
    const stale = await admin
      .patch(`${cashFlow()}/payments/${mine.id}`)
      .send({ name: "x", version: mine.version });
    expect(stale.status).toBe(409);
    const forbidden = await member
      .delete(`${cashFlow()}/payments/${theirs.id}`)
      .send({ version: theirs.version });
    expect(forbidden.status).toBe(403);
    const removed = await member
      .delete(`${cashFlow()}/payments/${mine.id}`)
      .send({ version: mine.version + 1 });
    expect(removed.status).toBe(200);
    expect(
      departmentNamed(removed.body.data, "Production").payments.map(
        (p) => p.name,
      ),
    ).toEqual(["Rebate"]);
    const audit = await auditActions("cash_flow_payment", mine.id);
    expect(audit.map((r) => r.action)).toEqual([
      "cash_flow_payment.created",
      "cash_flow_payment.updated",
      "cash_flow_payment.deleted",
    ]);
    expect(audit[1].metadata).toMatchObject({
      fromAmount: "0.10",
      toAmount: "999999999999.99",
    });
    await expect(
      context.database.client.query(
        "INSERT INTO cash_flow_payments (cash_flow_id, budget_department_id, name, amount, direction, date, created_by_user_id) VALUES ($1, $2, 'x', 0, 'outflow', '2026-01-01', $3)",
        [data.id, productionId, memberId],
      ),
    ).rejects.toThrow(/cash_flow_payments_amount_positive/);
  });

  it("source timing overrides the plan's expected date without touching the source; only approved sources qualify", async () => {
    const notApproved = await member
      .put(`${cashFlow()}/sources/${targetedSourceId}/timing`)
      .send({ expectedDate: "2026-05-01", version: 0 });
    expect(notApproved.status).toBe(422);
    expect(notApproved.body.error.code).toBe("FINANCE_SOURCE_NOT_APPROVED");
    const set = await member
      .put(`${cashFlow()}/sources/${approvedSourceId}/timing`)
      .send({ expectedDate: "2026-05-01", version: 0 });
    expect(set.status).toBe(200);
    const data: CashFlowData = set.body.data;
    expect(data.sources[0]).toMatchObject({
      expectedDate: "2026-03-15",
      scheduledDate: "2026-05-01",
      timing: { expectedDate: "2026-05-01", version: 1 },
    });
    expect(periodOf(data, "2026-03").inflow).toBe("0.00");
    expect(periodOf(data, "2026-05").inflow).toBe("1000000.00");
    const source = (await member.get(plan())).body.data.sources.find(
      (s: { id: string }) => s.id === approvedSourceId,
    );
    expect(source).toMatchObject({
      expectedDate: "2026-03-15",
      status: "approved",
    });
    const cleared = await admin
      .delete(`${cashFlow()}/sources/${approvedSourceId}/timing`)
      .send({ version: 1 });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.sources[0]).toMatchObject({
      scheduledDate: "2026-03-15",
      timing: null,
    });
  });

  it("opening balance and timeframe are versioned on the cash flow; balances run exactly and go negative", async () => {
    const before = await current();
    const stale = await member
      .patch(cashFlow())
      .send({ openingBalance: "100", version: before.version + 3 });
    expect(stale.status).toBe(409);
    const negative = await member
      .patch(cashFlow())
      .send({ openingBalance: "-5", version: before.version });
    expect(negative.status).toBe(400);
    const updated = await member.patch(cashFlow()).send({
      openingBalance: "0.10",
      timeframe: "weekly",
      version: before.version,
    });
    expect(updated.status).toBe(200);
    const data: CashFlowData = updated.body.data;
    expect(data).toMatchObject({
      openingBalance: "0.10",
      timeframe: "weekly",
      version: before.version + 1,
    });
    expect(data.projection.periods[0].id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Running balance: 0.10 + rebate 0.20 (Feb) + equity 1,000,000 (Mar) − post window 1,234,567.59 (Apr).
    expect(data.projection.closingBalance).toBe("-234567.29");
    expect(data.projection.lowestBalance).toBe("-234567.29");
    expect(data.projection.firstShortfallPeriodId).not.toBeNull();
    const monthly = await member
      .patch(cashFlow())
      .send({ timeframe: "monthly", version: data.version });
    expect(monthly.status).toBe(200);
    expect(periodOf(monthly.body.data, "2026-04").closingBalance).toBe(
      "-234567.29",
    );
    expect((await auditActions("cash_flow", data.id)).at(-1)).toMatchObject({
      action: "cash_flow.updated",
      metadata: { fromTimeframe: "weekly", toTimeframe: "monthly" },
    });
  });
});

describe("financing overview", () => {
  it("is derived from budget, finance plan and cash flow with no persisted state, and empty where nothing exists", async () => {
    const empty = await member.get(overview(otherProjectId));
    expect(empty.status).toBe(200);
    expect(empty.body.data).toMatchObject({
      currency: "GBP",
      financePlan: null,
      cashFlow: null,
    });
    expect(empty.body.data.budget.lockedVersion).toMatchObject({
      versionNumber: 1,
      total: "1234567.89",
    });
    const unknown = await member.get(
      overview("00000000-0000-4000-8000-000000000000"),
    );
    expect(unknown.status).toBe(404);

    const full = await member.get(overview());
    expect(full.status).toBe(200);
    const planData = (await member.get(plan())).body.data;
    const cash = await current();
    expect(full.body.data).toMatchObject({
      currency: "GBP",
      budget: {
        lockedVersion: {
          id: lockedVersionId,
          versionNumber: 1,
          total: "1234567.89",
        },
        openVersionStatus: "draft",
      },
      financePlan: {
        budgetVersionId: lockedVersionId,
        summary: planData.summary,
      },
      cashFlow: {
        id: cash.id,
        openingBalance: "0.10",
        closingBalance: "-234567.29",
        lowestBalance: "-234567.29",
        firstShortfallPeriodLabel: "Apr 2026",
        unscheduledOutflow: "0.30",
      },
    });
    expect(full.body.data.financePlan.summary).toMatchObject({
      budgetTotal: "1234567.89",
      approvedTotal: "1000000.00",
      fundingGap: "234567.89",
    });
    expect(
      full.body.data.financePlan.sources.map(
        (s: { name: string; status: string }) => [s.name, s.status],
      ),
    ).toEqual([
      ["Equity", "approved"],
      ["Grant", "targeted"],
    ]);
    const tables = await context.database.client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name ~ 'overview'",
    );
    expect(tables.rows).toEqual([]);
    expect(
      (
        await context.database.client.query(
          "SELECT 1 FROM audit_events WHERE entity_type ~ 'overview'",
        )
      ).rows,
    ).toEqual([]);
  });

  it("is unavailable without a session", async () => {
    const response = await request(await context.newApp()).get(overview());
    expect(response.status).toBe(401);
  });
});

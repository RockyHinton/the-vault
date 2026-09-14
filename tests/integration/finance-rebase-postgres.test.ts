import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Response } from "supertest";
import {
  adminCredentials,
  createTestContext,
  memberCredentials,
  type TestContext,
} from "../support/test-context";

/**
 * A Finance Plan rebase never makes authored Cash Flow work disappear.
 * Scheduling follows department lineage (a revision copy keeps its source's
 * lineage): corresponding and renamed departments carry their windows and
 * payments to the new version; a department with no counterpart keeps its
 * scheduling as explicitly listed "unassigned" work. Money stays exact and
 * the overview agrees with the cash flow.
 */

type Agent = Awaited<ReturnType<TestContext["loginAs"]>>;
interface Payment {
  id: string;
  name: string;
  amount: string;
  date: string;
  version: number;
}
interface Window {
  startDate: string;
  endDate: string;
  version: number;
}
interface Department {
  id: string;
  name: string;
  total: string;
  version: number;
  lineItems: { id: string; version: number }[];
  window?: Window | null;
  payments?: Payment[];
}

let context: TestContext;
let admin: Agent;
let member: Agent;
let projectId: string;

const api = (path: string) => `/api/v1/projects/${projectId}/${path}`;
const ok = (response: Response) => {
  expect(response.status, JSON.stringify(response.body)).toBeLessThan(300);
  return response;
};
const named = <T extends { name: string }>(items: T[], name: string): T => {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Nothing named ${name}`);
  return found;
};
const rows = async <T>(sql: string, params: unknown[] = []) =>
  (await context.database.client.query(sql, params)).rows as T[];

async function addDepartment(versionId: string, name: string, amount: string) {
  const created = ok(
    await member
      .post(api(`budget/versions/${versionId}/departments`))
      .send({ name }),
  );
  const department = named<Department>(created.body.data.departments, name);
  ok(
    await member
      .post(api(`budget/departments/${department.id}/line-items`))
      .send({ name: `${name} costs`, amount }),
  );
  return department.id;
}

async function lock(versionId: string) {
  const current = (await member.get(api("budget"))).body.data.currentVersion;
  expect(current.id).toBe(versionId);
  const submitted = ok(
    await member
      .post(api(`budget/versions/${versionId}/submit`))
      .send({ version: current.version }),
  );
  ok(
    await admin
      .post(api(`budget/versions/${versionId}/lock`))
      .send({ version: submitted.body.data.currentVersion.version }),
  );
}

async function rebase(budgetVersionId: string, agent: Agent = admin) {
  const plan = (await member.get(api("finance-plan"))).body.data;
  return agent
    .post(api("finance-plan/budget-version"))
    .send({ budgetVersionId, version: plan.version });
}

const cashFlow = async () => ok(await member.get(api("cash-flow"))).body.data;

const rebaseEvents = () =>
  rows<{ metadata: { cashFlow: unknown } }>(
    "SELECT metadata FROM audit_events WHERE action = 'finance_plan.rebased' AND metadata->>'projectId' = $1 ORDER BY created_at",
    [projectId],
  );

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (await admin.post("/api/v1/projects").send({ title: "Rebased" }))
    .body.data.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("finance plan rebase: authored cash-flow scheduling follows department lineage", () => {
  const ids: Record<string, string> = {};
  let v1Id: string;
  let v2Id: string;

  it("moves windows and payments to corresponding (and renamed) departments, keeps a removed department's scheduling as unassigned, and stays exact", async () => {
    v1Id = ok(await member.post(api("budget")).send({ currency: "GBP" })).body
      .data.currentVersion.id;
    ids.cameraV1 = await addDepartment(v1Id, "Camera", "1000.10");
    ids.locationsV1 = await addDepartment(v1Id, "Locations", "2000.20");
    ids.cateringV1 = await addDepartment(v1Id, "Catering", "300.00");
    await lock(v1Id);

    ok(await member.post(api("finance-plan")).send({ budgetVersionId: v1Id }));
    for (const amount of ["1000.10", "0.20"]) {
      const plan = ok(
        await member
          .post(api("finance-plan/sources"))
          .send({ name: `Equity ${amount}`, type: "equity", amount }),
      );
      const source = named<{ name: string; id: string; version: number }>(
        plan.body.data.sources,
        `Equity ${amount}`,
      );
      ok(
        await admin
          .post(api(`finance-plan/sources/${source.id}/approve`))
          .send({ version: source.version }),
      );
    }

    ok(await member.post(api("cash-flow")));
    ok(
      await member
        .put(api(`cash-flow/departments/${ids.cameraV1}/window`))
        .send({ startDate: "2027-01-01", endDate: "2027-01-31", version: 0 }),
    );
    ok(
      await member
        .put(api(`cash-flow/departments/${ids.cateringV1}/window`))
        .send({ startDate: "2027-02-01", endDate: "2027-02-28", version: 0 }),
    );
    ok(
      await member.post(api("cash-flow/payments")).send({
        departmentId: ids.locationsV1,
        name: "Location deposit",
        amount: "250.05",
        direction: "outflow",
        date: "2027-01-15",
      }),
    );
    ok(
      await member.post(api("cash-flow/payments")).send({
        departmentId: ids.cateringV1,
        name: "Catering deposit",
        amount: "99.99",
        direction: "outflow",
        date: "2027-02-10",
      }),
    );

    // Revision v2: Locations renamed, Catering removed, VFX added, Camera grows by a cent.
    const revision = ok(
      await member.post(api(`budget/versions/${v1Id}/revisions`)),
    ).body.data.currentVersion;
    v2Id = revision.id;
    const departments: Department[] = revision.departments;
    const cameraV2 = named(departments, "Camera");
    const locationsV2 = named(departments, "Locations");
    const cateringV2 = named(departments, "Catering");
    expect(cameraV2.id).not.toBe(ids.cameraV1);
    ids.cameraV2 = cameraV2.id;
    ids.locationsV2 = locationsV2.id;
    ok(
      await member
        .patch(api(`budget/departments/${locationsV2.id}`))
        .send({ name: "Locations & Permits", version: locationsV2.version }),
    );
    ok(
      await member
        .delete(api(`budget/line-items/${cateringV2.lineItems[0].id}`))
        .send({ version: cateringV2.lineItems[0].version }),
    );
    ok(
      await member
        .delete(api(`budget/departments/${cateringV2.id}`))
        .send({ version: cateringV2.version }),
    );
    ids.vfxV2 = await addDepartment(v2Id, "VFX", "500.00");
    ok(
      await member
        .post(api(`budget/departments/${cameraV2.id}/line-items`))
        .send({ name: "Filter", amount: "0.01" }),
    );
    await lock(v2Id);

    const rebased = await rebase(v2Id);
    expect(rebased.status).toBe(200);
    expect(rebased.body.data).toMatchObject({
      budgetVersionId: v2Id,
      budgetVersionNumber: 2,
    });
    expect(rebased.body.data.summary.budgetTotal).toBe("3500.31");
    const events = await rebaseEvents();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({
      fromBudgetVersionId: v1Id,
      toBudgetVersionId: v2Id,
      toBudgetVersionNumber: 2,
      cashFlow: {
        windowsMoved: 1,
        paymentsMoved: 1,
        windowsUnassigned: 1,
        paymentsUnassigned: 1,
      },
    });

    const after = await cashFlow();
    expect(after).toMatchObject({
      budgetVersionId: v2Id,
      budgetVersionNumber: 2,
      budgetTotal: "3500.31",
      approvedFundingTotal: "1000.30",
    });
    const camera = named<Department>(after.departments, "Camera");
    expect(camera.id).toBe(ids.cameraV2);
    expect(camera.total).toBe("1000.11");
    expect(camera.window).toMatchObject({
      startDate: "2027-01-01",
      endDate: "2027-01-31",
      version: 2,
    });
    const locations = named<Department>(
      after.departments,
      "Locations & Permits",
    );
    expect(
      locations.payments?.map((p) => [p.name, p.amount, p.date, p.version]),
    ).toEqual([["Location deposit", "250.05", "2027-01-15", 2]]);
    const vfx = named<Department>(after.departments, "VFX");
    expect(vfx.window).toBeNull();
    expect(vfx.payments).toEqual([]);
    expect(after.unassigned).toEqual([
      {
        departmentId: ids.cateringV1,
        departmentName: "Catering",
        budgetVersionNumber: 1,
        window: expect.objectContaining({
          startDate: "2027-02-01",
          endDate: "2027-02-28",
          version: 1,
        }),
        payments: [
          expect.objectContaining({
            name: "Catering deposit",
            amount: "99.99",
            version: 1,
          }),
        ],
      },
    ]);
    // Camera 1000.11 spread across January plus the 250.05 deposit; the
    // unassigned Catering work is listed, not projected.
    expect(after.projection).toMatchObject({
      totalInflow: "0.00",
      totalOutflow: "1250.16",
      closingBalance: "-1250.16",
      unscheduledInflow: "1000.30",
      unscheduledOutflow: "2500.20",
    });

    // Nothing authored was deleted; the lineage is what linked the copies.
    expect(
      (
        await rows<{ n: number }>(
          "SELECT (SELECT count(*) FROM cash_flow_department_windows)::int + (SELECT count(*) FROM cash_flow_payments)::int AS n",
        )
      )[0].n,
    ).toBe(4);
    const lineage = await rows<{ id: string; lineage_id: string }>(
      "SELECT id, lineage_id FROM budget_departments WHERE id = ANY($1)",
      [[ids.cameraV1, ids.cameraV2, ids.vfxV2]],
    );
    const lineageOf = (id: string) =>
      lineage.find((row) => row.id === id)?.lineage_id;
    expect(lineageOf(ids.cameraV2)).toBe(lineageOf(ids.cameraV1));
    expect(lineageOf(ids.vfxV2)).toBe(ids.vfxV2);

    const overview = ok(await member.get(api("financing-overview"))).body.data;
    expect(overview.budget.lockedVersion).toMatchObject({
      versionNumber: 2,
      total: "3500.31",
    });
    expect(overview.financePlan).toMatchObject({
      budgetVersionNumber: 2,
      summary: {
        budgetTotal: "3500.31",
        approvedTotal: "1000.30",
        fundingGap: "2500.01",
      },
    });
    expect(overview.cashFlow).toMatchObject({
      totalOutflow: after.projection.totalOutflow,
      closingBalance: after.projection.closingBalance,
      unscheduledOutflow: after.projection.unscheduledOutflow,
      unassignedItemCount: 2,
    });
  });

  it("unassigned work is moved or cleared with the existing commands; rebasing back restores what corresponds", async () => {
    const before = await cashFlow();
    const [catering] = before.unassigned;
    const vfx = named<Department>(before.departments, "VFX");
    ok(
      await member
        .patch(api(`cash-flow/payments/${catering.payments[0].id}`))
        .send({ departmentId: vfx.id, version: catering.payments[0].version }),
    );
    const cleared = ok(
      await member
        .delete(api(`cash-flow/departments/${catering.departmentId}/window`))
        .send({ version: catering.window.version }),
    ).body.data;
    expect(cleared.unassigned).toEqual([]);
    expect(
      named<Department>(cleared.departments, "VFX").payments?.map(
        (p) => p.amount,
      ),
    ).toEqual(["99.99"]);
    expect(cleared.projection.totalOutflow).toBe("1350.15");

    expect((await rebase(v1Id)).status).toBe(200);
    expect((await rebaseEvents())[1].metadata.cashFlow).toEqual({
      windowsMoved: 1,
      paymentsMoved: 1,
      windowsUnassigned: 0,
      paymentsUnassigned: 1,
    });
    const back = await cashFlow();
    const camera = named<Department>(back.departments, "Camera");
    expect(camera.id).toBe(ids.cameraV1);
    expect(camera.window).toMatchObject({
      startDate: "2027-01-01",
      version: 3,
    });
    expect(
      named<Department>(back.departments, "Locations").payments?.map(
        (p) => p.amount,
      ),
    ).toEqual(["250.05"]);
    expect(back.unassigned).toEqual([
      expect.objectContaining({
        departmentId: ids.vfxV2,
        departmentName: "VFX",
        budgetVersionNumber: 2,
        window: null,
        payments: [expect.objectContaining({ amount: "99.99" })],
      }),
    ]);
  });

  it("a refused rebase moves nothing and audits nothing; a department re-created under the same name is not the old department", async () => {
    const draft = ok(
      await member.post(api(`budget/versions/${v2Id}/revisions`)),
    ).body.data.currentVersion;
    const scheduling = () =>
      rows(
        "SELECT id, budget_department_id, version FROM cash_flow_department_windows UNION ALL SELECT id, budget_department_id, version FROM cash_flow_payments ORDER BY id",
      );
    const snapshot = await scheduling();

    const unlocked = await rebase(draft.id);
    expect(unlocked.status).toBe(422);
    expect(unlocked.body.error.code).toBe("BUDGET_VERSION_NOT_LOCKED");
    const plan = (await member.get(api("finance-plan"))).body.data;
    const stale = await admin
      .post(api("finance-plan/budget-version"))
      .send({ budgetVersionId: v2Id, version: plan.version + 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect((await rebase(v2Id, member)).status).toBe(403);
    expect(await scheduling()).toEqual(snapshot);
    expect(await rebaseEvents()).toHaveLength(2);

    // v3: VFX is deleted and a new department is created with the same name.
    const vfxV3 = named<Department>(draft.departments, "VFX");
    ok(
      await member
        .delete(api(`budget/line-items/${vfxV3.lineItems[0].id}`))
        .send({ version: vfxV3.lineItems[0].version }),
    );
    ok(
      await member
        .delete(api(`budget/departments/${vfxV3.id}`))
        .send({ version: vfxV3.version }),
    );
    const newVfx = await addDepartment(draft.id, "VFX", "500.00");
    await lock(draft.id);

    expect((await rebase(draft.id)).status).toBe(200);
    // Camera and Locations follow their lineage from v1 straight to v3.
    expect((await rebaseEvents())[2].metadata.cashFlow).toEqual({
      windowsMoved: 1,
      paymentsMoved: 1,
      windowsUnassigned: 0,
      paymentsUnassigned: 1,
    });
    const after = await cashFlow();
    expect(after.budgetVersionNumber).toBe(3);
    expect(named<Department>(after.departments, "VFX")).toMatchObject({
      id: newVfx,
      payments: [],
    });
    expect(named<Department>(after.departments, "Camera").window).toMatchObject(
      { startDate: "2027-01-01", version: 4 },
    );
    expect(after.unassigned).toEqual([
      expect.objectContaining({
        departmentId: ids.vfxV2,
        departmentName: "VFX",
        budgetVersionNumber: 2,
        payments: [expect.objectContaining({ amount: "99.99" })],
      }),
    ]);
  });
});

describe("money: derived totals beyond a single stored amount", () => {
  it("a department of eleven maximum line items is served exactly by Budget, Finance Plan, Cash Flow and the overview", async () => {
    projectId = (await admin.post("/api/v1/projects").send({ title: "Epic" }))
      .body.data.id;
    const versionId = ok(
      await member.post(api("budget")).send({ currency: "USD" }),
    ).body.data.currentVersion.id;
    const departmentId = await addDepartment(
      versionId,
      "Epic",
      "999999999999.99",
    );
    for (let i = 1; i < 11; i += 1)
      ok(
        await member
          .post(api(`budget/departments/${departmentId}/line-items`))
          .send({ name: `Epic ${i}`, amount: "999999999999.99" }),
      );
    const expected = "10999999999999.89";

    const budget = ok(await member.get(api("budget"))).body.data;
    expect(
      named<Department>(budget.currentVersion.departments, "Epic").total,
    ).toBe(expected);
    expect(budget.currentVersion.total).toBe(expected);
    await lock(versionId);
    const plan = ok(
      await member
        .post(api("finance-plan"))
        .send({ budgetVersionId: versionId }),
    ).body.data;
    expect(plan.summary).toMatchObject({
      budgetTotal: expected,
      fundingGap: expected,
    });
    const created = ok(await member.post(api("cash-flow"))).body.data;
    expect(created.budgetTotal).toBe(expected);
    expect(named<Department>(created.departments, "Epic").total).toBe(expected);
    expect(created.projection.unscheduledOutflow).toBe(expected);
    const overview = ok(await member.get(api("financing-overview"))).body.data;
    expect(overview.budget.lockedVersion.total).toBe(expected);
  });
});

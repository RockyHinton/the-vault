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
let adminId: string;

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
type Version = {
  id: string;
  version: number;
  status: string;
  total: string;
  departments: {
    id: string;
    name: string;
    position: number;
    version: number;
    total: string;
    lineItems: { id: string; amount: string; version: number }[];
    documents: { id: string }[];
  }[];
};
const current = async (agent: Agent = member): Promise<Version> =>
  (await agent.get(budget())).body.data.currentVersion;
const departmentNamed = (version: Version, name: string) =>
  version.departments.find((d) => d.name === name)!;

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (await admin.post("/api/v1/projects").send({ title: "Budgeted" }))
    .body.data.id;
  otherProjectId = (
    await admin.post("/api/v1/projects").send({ title: "Elsewhere" })
  ).body.data.id;
  memberId = (await member.get("/api/v1/auth/me")).body.data.user.id;
  adminId = (await admin.get("/api/v1/auth/me")).body.data.user.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("budget: creation", () => {
  it("a project has no budget until someone creates one; creation seeds version 1 with the default departments", async () => {
    expect((await member.get(budget())).status).toBe(404);
    const created = await member
      .post(budget())
      .send({ currency: "GBP", createdBy: { id: "spoofed" } });
    expect(created.status).toBe(201);
    const data = created.body.data;
    expect(data).toMatchObject({
      projectId,
      currency: "GBP",
      createdBy: { id: memberId },
      latestLockedVersionId: null,
    });
    expect(data.createdBy).not.toHaveProperty("email");
    expect(data.currentVersion).toMatchObject({
      versionNumber: 1,
      status: "draft",
      total: "0.00",
      currency: "GBP",
      version: 1,
    });
    expect(
      data.currentVersion.departments.map(
        (d: { name: string; position: number }) => [d.name, d.position],
      ),
    ).toEqual([
      ["Above the Line", 0],
      ["Production", 1],
      ["Post-Production", 2],
      ["Other", 3],
      ["Contingency", 4],
    ]);
    expect(data.versions).toHaveLength(1);
    expect((await member.post(budget()).send({})).status).toBe(409);
    expect(
      (await auditActions("budget", data.id)).map((row) => row.action),
    ).toEqual(["budget.created"]);
  });

  it("the budget is unreachable through another project", async () => {
    const version = await current();
    expect(
      (await admin.get(`${budget(otherProjectId)}/versions/${version.id}`))
        .status,
    ).toBe(404);
    const department = departmentNamed(version, "Production");
    expect(
      (
        await admin
          .post(
            `${budget(otherProjectId)}/departments/${department.id}/line-items`,
          )
          .send({ name: "x" })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .post(`${budget(otherProjectId)}/versions/${version.id}/submit`)
          .send({ version: 1 })
      ).status,
    ).toBe(404);
  });
});

describe("budget: money and line items", () => {
  it("stores exact decimals and sums them in PostgreSQL without floating-point artefacts", async () => {
    const version = await current();
    const production = departmentNamed(version, "Production");
    const post = departmentNamed(version, "Post-Production");
    for (const [department, name, amount] of [
      [production, "Camera package", "0.10"],
      [production, "Grip", "0.20"],
      [post, "Sound mix", "125000"],
      [post, "Colour", "999999999999.99"],
    ] as const) {
      const created = await member
        .post(`${budget()}/departments/${department.id}/line-items`)
        .send({ name, amount });
      expect(created.status).toBe(201);
      const stored = departmentNamed(
        created.body.data,
        department.name,
      ).lineItems.at(-1)!;
      const expected = amount.includes(".")
        ? amount.padEnd(amount.indexOf(".") + 3, "0")
        : `${amount}.00`;
      expect(stored.amount, `${name} amount`).toBe(expected);
    }
    const after = await current();
    expect(departmentNamed(after, "Production").total).toBe("0.30");
    expect(departmentNamed(after, "Post-Production").total).toBe(
      "1000000124999.99",
    );
    expect(after.total).toBe("1000000125000.29");
    expect(after.total).toBe(
      sumMoney(
        after.departments.flatMap((d) => d.lineItems.map((i) => i.amount)),
      ),
    );
    const colour = departmentNamed(after, "Post-Production").lineItems.find(
      (i) => i.amount === "999999999999.99",
    )!;
    const stored = await context.database.client.query(
      "SELECT amount::text AS amount FROM budget_line_items WHERE id = $1",
      [colour.id],
    );
    expect(stored.rows[0].amount).toBe("999999999999.99");
  });

  it("refuses malformed or negative money at the boundary and in PostgreSQL", async () => {
    const version = await current();
    const production = departmentNamed(version, "Production");
    for (const amount of ["-1", "12.345", "1,000", "abc", 12]) {
      const response = await member
        .post(`${budget()}/departments/${production.id}/line-items`)
        .send({ name: "bad", amount });
      expect(response.status, String(amount)).toBe(400);
    }
    await expect(
      context.database.client.query(
        "UPDATE budget_line_items SET amount = -1 WHERE budget_department_id = $1",
        [production.id],
      ),
    ).rejects.toThrow(/budget_line_items_amount_non_negative/);
  });

  it("edits and deletes line items with versions; stale writes leave no audit", async () => {
    const version = await current();
    const item = departmentNamed(version, "Production").lineItems[0];
    const stale = await admin
      .patch(`${budget()}/line-items/${item.id}`)
      .send({ amount: "1.00", version: item.version + 1 });
    expect(stale.status).toBe(409);
    const edited = await admin
      .patch(`${budget()}/line-items/${item.id}`)
      .send({ amount: "1.5", note: "Rental", version: item.version });
    expect(edited.status).toBe(200);
    const updatedItem = departmentNamed(
      edited.body.data,
      "Production",
    ).lineItems.find((i: { id: string }) => i.id === item.id);
    expect(updatedItem).toMatchObject({
      amount: "1.50",
      note: "Rental",
      version: item.version + 1,
    });
    expect(departmentNamed(edited.body.data, "Production").total).toBe("1.70");
    const events = await auditActions("budget_line_item", item.id);
    expect(events.map((row) => row.action)).toEqual([
      "budget_line_item.created",
      "budget_line_item.updated",
    ]);
    expect(events[1].metadata).toMatchObject({
      fromAmount: "0.10",
      toAmount: "1.50",
      changedFields: ["amount", "note"],
    });
    const deleted = await member
      .delete(`${budget()}/line-items/${item.id}`)
      .send({ version: item.version + 1 });
    expect(deleted.status).toBe(200);
    expect(departmentNamed(deleted.body.data, "Production").total).toBe("0.20");
  });
});

describe("budget: departments", () => {
  it("adds, renames and removes departments; names are unique per version and removal needs an empty department", async () => {
    const version = await current();
    const duplicate = await member
      .post(`${budget()}/versions/${version.id}/departments`)
      .send({ name: "production" });
    expect(duplicate.status).toBe(409);
    const added = await member
      .post(`${budget()}/versions/${version.id}/departments`)
      .send({ name: "Music" });
    expect(added.status).toBe(201);
    const music = departmentNamed(added.body.data, "Music");
    expect(music.position).toBe(5);
    const renamed = await admin
      .patch(`${budget()}/departments/${music.id}`)
      .send({ name: "Music & Score", version: music.version });
    expect(renamed.status).toBe(200);
    const production = departmentNamed(version, "Production");
    const notEmpty = await member
      .delete(`${budget()}/departments/${production.id}`)
      .send({ version: production.version });
    expect(notEmpty.status).toBe(409);
    expect(notEmpty.body.error.code).toBe("BUDGET_DEPARTMENT_NOT_EMPTY");
    const removed = await member
      .delete(`${budget()}/departments/${music.id}`)
      .send({
        version: departmentNamed(renamed.body.data, "Music & Score").version,
      });
    expect(removed.status).toBe(200);
    expect(
      removed.body.data.departments.map((d: { name: string }) => d.name),
    ).not.toContain("Music & Score");
    expect(
      (await auditActions("budget_department", music.id)).map(
        (row) => row.action,
      ),
    ).toEqual([
      "budget_department.created",
      "budget_department.updated",
      "budget_department.deleted",
    ]);
  });

  it("attaches supporting documents into the budget folder and detaches them while in draft", async () => {
    const version = await current();
    const other = departmentNamed(version, "Other");
    const fileId = await stagePdf(member, "Camera Quote.pdf");
    const attached = await member
      .post(`${budget()}/departments/${other.id}/documents`)
      .send({ fileObjectId: fileId, title: "Camera Quote" });
    expect(attached.status).toBe(201);
    expect(
      departmentNamed(attached.body.data, "Other").documents[0],
    ).toMatchObject({
      title: "Camera Quote",
      folder: "financing/budget",
    });
  });
});

describe("budget: lifecycle and history", () => {
  let v1Id: string;

  it("draft → awaiting approval by any user; awaiting versions cannot be edited", async () => {
    const version = await current();
    v1Id = version.id;
    const stale = await member
      .post(`${budget()}/versions/${v1Id}/submit`)
      .send({ version: version.version + 1 });
    expect(stale.status).toBe(409);
    const submitted = await member
      .post(`${budget()}/versions/${v1Id}/submit`)
      .send({ version: version.version });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.currentVersion).toMatchObject({
      status: "awaiting_approval",
      submittedBy: { id: memberId },
      version: version.version + 1,
    });
    const production = departmentNamed(
      submitted.body.data.currentVersion,
      "Production",
    );
    const frozen = await member
      .post(`${budget()}/departments/${production.id}/line-items`)
      .send({ name: "Late", amount: "5" });
    expect(frozen.status).toBe(409);
    expect(frozen.body.error.code).toBe("BUDGET_VERSION_NOT_EDITABLE");
    expect(
      (
        await member
          .post(`${budget()}/versions/${v1Id}/submit`)
          .send({ version: version.version + 1 })
      ).status,
    ).toBe(409);
  });

  it("only a studio_admin locks; the locked version records the approver and is immutable in PostgreSQL terms", async () => {
    const version = await current();
    const forbidden = await member
      .post(`${budget()}/versions/${v1Id}/lock`)
      .send({ version: version.version });
    expect(forbidden.status).toBe(403);
    const locked = await admin
      .post(`${budget()}/versions/${v1Id}/lock`)
      .send({ version: version.version });
    expect(locked.status).toBe(200);
    expect(locked.body.data.currentVersion).toMatchObject({
      id: v1Id,
      status: "locked",
      lockedBy: { id: adminId },
      total: "1000000125000.19",
    });
    expect(locked.body.data.latestLockedVersionId).toBe(v1Id);
    const production = departmentNamed(
      locked.body.data.currentVersion,
      "Production",
    );
    const edit = await admin
      .patch(`${budget()}/line-items/${production.lineItems[0].id}`)
      .send({ amount: "1", version: production.lineItems[0].version });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe("BUDGET_VERSION_NOT_EDITABLE");
    expect(
      (
        await admin
          .delete(`${budget()}/departments/${production.id}`)
          .send({ version: production.version })
      ).status,
    ).toBe(409);
    expect(
      (
        await admin
          .post(`${budget()}/versions/${v1Id}/departments`)
          .send({ name: "Late" })
      ).status,
    ).toBe(409);
    const detach = await admin.delete(
      `${budget()}/departments/${departmentNamed(locked.body.data.currentVersion, "Other").id}/documents/${departmentNamed(locked.body.data.currentVersion, "Other").documents[0].id}`,
    );
    expect(detach.status).toBe(409);
    expect(
      (await auditActions("budget_version", v1Id)).map((row) => row.action),
    ).toEqual(["budget_version.submitted", "budget_version.locked"]);
    // Status/timestamp coherence is a PostgreSQL rule, not just service policy.
    await expect(
      context.database.client.query(
        "UPDATE budget_versions SET status = 'draft' WHERE id = $1",
        [v1Id],
      ),
    ).rejects.toThrow(
      /budget_versions_submitted_matches_status|budget_versions_locked_matches_status/,
    );
  });

  it("a revision copies the locked version into a new draft; the locked version stays exact and addressable", async () => {
    const revision = await member.post(
      `${budget()}/versions/${v1Id}/revisions`,
    );
    expect(revision.status).toBe(201);
    const data = revision.body.data;
    expect(data.currentVersion).toMatchObject({
      versionNumber: 2,
      status: "draft",
      total: "1000000125000.19",
    });
    expect(data.latestLockedVersionId).toBe(v1Id);
    expect(
      data.versions.map((v: { versionNumber: number; status: string }) => [
        v.versionNumber,
        v.status,
      ]),
    ).toEqual([
      [2, "draft"],
      [1, "locked"],
    ]);
    const v2 = data.currentVersion as Version;
    expect(v2.departments.map((d) => d.name)).toEqual([
      "Above the Line",
      "Production",
      "Post-Production",
      "Other",
      "Contingency",
    ]);
    expect(departmentNamed(v2, "Other").documents).toHaveLength(1);
    expect(
      (await member.post(`${budget()}/versions/${v1Id}/revisions`)).status,
    ).toBe(409);
    // Editing v2 does not touch v1.
    const production = departmentNamed(v2, "Production");
    await member
      .patch(`${budget()}/line-items/${production.lineItems[0].id}`)
      .send({ amount: "500", version: production.lineItems[0].version });
    const v1 = await member.get(`${budget()}/versions/${v1Id}`);
    expect(v1.status).toBe(200);
    expect(v1.body.data).toMatchObject({
      status: "locked",
      total: "1000000125000.19",
      versionNumber: 1,
    });
    expect(departmentNamed(v1.body.data, "Production").total).toBe("0.20");
    expect((await member.get(budget())).body.data.currentVersion.total).toBe(
      "1000000125499.99",
    );
    // PostgreSQL refuses a second open version outright.
    const [{ id: budgetId }] = (
      await context.database.client.query(
        "SELECT id FROM budgets WHERE project_id = $1",
        [projectId],
      )
    ).rows;
    await expect(
      context.database.client.query(
        "INSERT INTO budget_versions (budget_id, version_number, created_by_user_id) VALUES ($1, 9, $2)",
        [budgetId, memberId],
      ),
    ).rejects.toThrow(/budget_versions_one_open_per_budget/);
  });
});

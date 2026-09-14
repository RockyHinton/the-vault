import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminCredentials,
  createTestContext,
  memberCredentials,
  type TestContext,
} from "../support/test-context";

/**
 * Cross-project scoping for the authored-record reference domains, the
 * projects routes as an ordinary member, locked-version document attachment,
 * a successful finance-plan rebase with its cash-flow orphan semantics, and
 * the inline-disposition rule over HTTP.
 */
type Agent = Awaited<ReturnType<TestContext["loginAs"]>>;

let context: TestContext;
let admin: Agent;
let member: Agent;
let projectId: string;
let otherProjectId: string;

const api = (id: string, path: string) => `/api/v1/projects/${id}/${path}`;
const stage = async (
  agent: Agent,
  name: string,
  bytes: Buffer,
  type = "application/octet-stream",
) => {
  const response = await agent
    .post("/api/v1/files")
    .set("content-type", type)
    .set("x-vault-filename", name)
    .send(bytes);
  expect(response.status).toBe(201);
  return response.body.data.id as string;
};
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF\n`);

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (await admin.post("/api/v1/projects").send({ title: "Scoped" }))
    .body.data.id;
  otherProjectId = (
    await admin.post("/api/v1/projects").send({ title: "Elsewhere" })
  ).body.data.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("cross-project scoping of authored records", () => {
  it("notes, tasks and reviews of project A are unreachable through project B", async () => {
    const note = await member
      .post(api(projectId, "notes"))
      .send({ body: "Private note", category: "other" });
    expect(note.status).toBe(201);
    const task = await member
      .post(api(projectId, "tasks"))
      .send({ title: "Private task" });
    expect(task.status).toBe(201);
    const review = await member.put(api(projectId, "reviews/mine")).send({
      version: 0,
      scores: { script: 6, director: 6, cast: 6, financing: 6 },
      summary: "Fine",
      summaryNotes: "Fine",
    });
    expect([200, 201]).toContain(review.status);
    const noteId = note.body.data.id;
    const taskId = task.body.data.id;
    const reviewId = review.body.data.id;

    expect(
      (
        await admin
          .patch(api(otherProjectId, `notes/${noteId}`))
          .send({ body: "x", version: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .delete(api(otherProjectId, `notes/${noteId}`))
          .send({ version: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .post(api(otherProjectId, `tasks/${taskId}/complete`))
          .send({ version: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .patch(api(otherProjectId, `tasks/${taskId}`))
          .send({ title: "x", version: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .delete(api(otherProjectId, `reviews/${reviewId}`))
          .send({ version: 1 })
      ).status,
    ).toBe(404);
    expect(
      (await admin.get(api(otherProjectId, "notes"))).body.data.items,
    ).toEqual([]);
    expect(
      (await admin.get(api(otherProjectId, "tasks"))).body.data.items,
    ).toEqual([]);
    expect(
      (await admin.get(api(otherProjectId, "reviews"))).body.data.items,
    ).toEqual([]);
  });
});

describe("projects routes as an ordinary member", () => {
  it("may read every project but is refused every administrative command", async () => {
    expect((await member.get("/api/v1/projects")).status).toBe(200);
    const project = await member.get(`/api/v1/projects/${projectId}`);
    expect(project.status).toBe(200);
    const version = project.body.data.version as number;
    expect(
      (await member.post("/api/v1/projects").send({ title: "Nope" })).status,
    ).toBe(403);
    expect(
      (
        await member
          .patch(`/api/v1/projects/${projectId}`)
          .send({ title: "Nope", version })
      ).status,
    ).toBe(403);
    expect(
      (
        await member
          .post(`/api/v1/projects/${projectId}/stage-transitions`)
          .send({ toStage: "development", version })
      ).status,
    ).toBe(403);
    expect(
      (
        await member
          .post(`/api/v1/projects/${projectId}/archive`)
          .send({ reason: "withdrawn", revisit: "no", version })
      ).status,
    ).toBe(403);
    expect(
      (await member.delete(`/api/v1/projects/${projectId}`).send({ version }))
        .status,
    ).toBe(403);
    expect(
      (await member.get(`/api/v1/projects/${projectId}`)).body.data,
    ).toMatchObject({ version, title: "Scoped" });
    const audit = await context.database.client.query(
      "SELECT count(*)::int AS n FROM audit_events WHERE entity_type = 'project' AND entity_id = $1",
      [projectId],
    );
    expect(audit.rows[0].n).toBe(1);
  });
});

describe("budget history and finance-plan rebase", () => {
  let v1Id: string;
  let v1Production: string;
  let v2Id: string;

  it("a locked budget version refuses document attachment", async () => {
    const created = await member
      .post(api(projectId, "budget"))
      .send({ currency: "GBP" });
    expect(created.status).toBe(201);
    const version = created.body.data.currentVersion;
    v1Id = version.id;
    v1Production = version.departments.find(
      (d: { name: string }) => d.name === "Production",
    ).id;
    expect(
      (
        await member
          .post(api(projectId, `budget/departments/${v1Production}/line-items`))
          .send({ name: "Crew", amount: "1000" })
      ).status,
    ).toBe(201);
    const fresh = (await member.get(api(projectId, "budget"))).body.data
      .currentVersion;
    const submitted = await member
      .post(api(projectId, `budget/versions/${v1Id}/submit`))
      .send({ version: fresh.version });
    const locked = await admin
      .post(api(projectId, `budget/versions/${v1Id}/lock`))
      .send({ version: submitted.body.data.currentVersion.version });
    expect(locked.status).toBe(200);
    const attach = await admin
      .post(api(projectId, `budget/departments/${v1Production}/documents`))
      .send({
        fileObjectId: await stage(admin, "quote.pdf", pdf("q")),
        title: "Quote",
        status: "draft",
      });
    expect(attach.status).toBe(409);
    expect(attach.body.error.code).toBe("BUDGET_VERSION_NOT_EDITABLE");
    expect(
      (
        await member.get(api(projectId, "budget"))
      ).body.data.currentVersion.departments.find(
        (d: { id: string }) => d.id === v1Production,
      ).documents,
    ).toEqual([]);
  });

  it("a successful rebase moves the baseline; cash-flow rows of the previous version leave the schedule but stay stored", async () => {
    const plan = await member
      .post(api(projectId, "finance-plan"))
      .send({ budgetVersionId: v1Id });
    expect(plan.status).toBe(201);
    const cashFlow = await member.post(api(projectId, "cash-flow"));
    expect(cashFlow.status).toBe(201);
    const window = await member
      .put(api(projectId, `cash-flow/departments/${v1Production}/window`))
      .send({ startDate: "2027-01-01", endDate: "2027-01-31", version: 0 });
    expect(window.status).toBe(200);
    expect(window.body.data.projection.totalOutflow).toBe("1000.00");

    // Revision v2, lock it, rebase the plan to it (admin only).
    const revision = await member.post(
      api(projectId, `budget/versions/${v1Id}/revisions`),
    );
    expect(revision.status).toBe(201);
    v2Id = revision.body.data.currentVersion.id;
    const v2Production = revision.body.data.currentVersion.departments.find(
      (d: { name: string }) => d.name === "Production",
    );
    expect(v2Production.id).not.toBe(v1Production);
    expect(
      (
        await member
          .post(
            api(projectId, `budget/departments/${v2Production.id}/line-items`),
          )
          .send({ name: "More crew", amount: "500" })
      ).status,
    ).toBe(201);
    const fresh = (await member.get(api(projectId, "budget"))).body.data
      .currentVersion;
    const submitted = await member
      .post(api(projectId, `budget/versions/${v2Id}/submit`))
      .send({ version: fresh.version });
    const locked = await admin
      .post(api(projectId, `budget/versions/${v2Id}/lock`))
      .send({ version: submitted.body.data.currentVersion.version });
    expect(locked.status).toBe(200);

    const before = (await member.get(api(projectId, "finance-plan"))).body.data;
    const rebased = await admin
      .post(api(projectId, "finance-plan/budget-version"))
      .send({ budgetVersionId: v2Id, version: before.version });
    expect(rebased.status).toBe(200);
    expect(rebased.body.data).toMatchObject({
      budgetVersionId: v2Id,
      budgetVersionNumber: 2,
      version: before.version + 1,
    });
    expect(rebased.body.data.summary.budgetTotal).toBe("1500.00");
    const events = await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_type = 'finance_plan' AND entity_id = $1 ORDER BY created_at",
      [before.id],
    );
    expect(events.rows.map((r: { action: string }) => r.action)).toEqual([
      "finance_plan.created",
      "finance_plan.rebased",
    ]);
    expect(events.rows[1].metadata).toMatchObject({
      fromBudgetVersionId: v1Id,
      toBudgetVersionId: v2Id,
      toBudgetVersionNumber: 2,
    });

    // The cash flow now reads v2's departments; the v1 window is out of the schedule but still stored.
    const after = (await member.get(api(projectId, "cash-flow"))).body.data;
    expect(after.budgetVersionId).toBe(v2Id);
    expect(
      after.departments.map((d: { id: string; window: unknown }) => [
        d.id === v2Production.id,
        d.window,
      ]),
    ).toContainEqual([true, null]);
    expect(after.projection.totalOutflow).toBe("0.00");
    expect(after.projection.unscheduledOutflow).toBe("1500.00");
    const stored = await context.database.client.query(
      "SELECT 1 FROM cash_flow_department_windows WHERE budget_department_id = $1",
      [v1Production],
    );
    expect(stored.rows).toHaveLength(1);
    // Scheduling the v1 department is now refused; v2's is accepted.
    expect(
      (
        await member
          .put(api(projectId, `cash-flow/departments/${v1Production}/window`))
          .send({ startDate: "2027-02-01", endDate: "2027-02-28", version: 1 })
      ).status,
    ).toBe(422);
    expect(
      (
        await member
          .put(
            api(projectId, `cash-flow/departments/${v2Production.id}/window`),
          )
          .send({ startDate: "2027-02-01", endDate: "2027-02-28", version: 0 })
      ).status,
    ).toBe(200);
  });
});

describe("file delivery disposition", () => {
  it("serves PDFs inline on request but never an unsafe type, even when asked", async () => {
    const pdfId = await stage(member, "brief.pdf", pdf("inline"));
    const text = await stage(
      member,
      "notes.txt",
      Buffer.from("INT. HARBOUR - NIGHT\nNot inline-safe.\n"),
      "text/plain",
    );
    const claimPdf = await member.post(api(projectId, "documents")).send({
      fileObjectId: pdfId,
      folder: "general",
      title: "Brief",
      status: "draft",
    });
    expect(claimPdf.status).toBe(201);
    const claimHtml = await member.post(api(projectId, "documents")).send({
      fileObjectId: text,
      folder: "general",
      title: "Notes",
      status: "draft",
    });
    expect(claimHtml.status).toBe(201);
    const inline = await member.get(
      `/api/v1/files/${pdfId}/content?disposition=inline`,
    );
    expect(inline.status).toBe(200);
    expect(inline.headers["content-disposition"]).toMatch(/^inline/);
    const attachment = await member.get(`/api/v1/files/${pdfId}/content`);
    expect(attachment.headers["content-disposition"]).toMatch(/^attachment/);
    const unsafe = await member.get(
      `/api/v1/files/${text}/content?disposition=inline`,
    );
    expect(unsafe.status).toBe(200);
    expect(unsafe.headers["content-disposition"]).toMatch(/^attachment/);
    expect(unsafe.headers["content-security-policy"]).toContain("sandbox");
    expect(unsafe.headers["x-content-type-options"]).toBe("nosniff");
  });
});

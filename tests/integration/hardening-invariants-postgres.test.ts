import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTransaction } from "../../server/db/transaction";
import { budgetLineItemRepository } from "../../server/modules/budget/budget-repository";
import { financeSourceRepository } from "../../server/modules/finance-plan/finance-plan-repository";
import { scriptRepository } from "../../server/modules/scripts/script-repository";
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

const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF\n`);
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
const auditActions = async (entityType: string, entityId: string) =>
  (
    await context.database.client.query(
      "SELECT action FROM audit_events WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at",
      [entityType, entityId],
    )
  ).rows.map((r: { action: string }) => r.action);
const documents = (id = projectId) => `/api/v1/projects/${id}/documents`;
const scripts = (id = projectId) => `/api/v1/projects/${id}/scripts`;
const budget = (id = projectId) => `/api/v1/projects/${id}/budget`;
const statuses = (responses: { status: number }[]) =>
  responses.map((r) => r.status).sort((a, b) => a - b);

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  projectId = (await admin.post("/api/v1/projects").send({ title: "Hardened" }))
    .body.data.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("documents: version ownership and history", () => {
  let lineageId: string;
  let v1Version: number;

  it("only the current version's uploader or an admin adds a version; a refusal changes nothing", async () => {
    const created = await admin.post(documents()).send({
      fileObjectId: await stage(admin, "Deal.pdf", pdf("v1")),
      folder: "general",
      title: "Deal",
      status: "draft",
    });
    expect(created.status).toBe(201);
    lineageId = created.body.data.id;
    v1Version = created.body.data.version;

    const refused = await member
      .post(`${documents()}/${lineageId}/versions`)
      .send({
        fileObjectId: await stage(member, "Deal-hijack.pdf", pdf("hijack")),
        status: "draft",
        version: v1Version,
      });
    expect(refused.status).toBe(403);
    const afterRefusal = await member.get(`${documents()}/${lineageId}`);
    expect(afterRefusal.body.data.document).toMatchObject({
      id: lineageId,
      isCurrent: true,
      versionNumber: 1,
      version: v1Version,
    });
    expect(afterRefusal.body.data.versions).toHaveLength(1);
    expect(await auditActions("document", lineageId)).toEqual([
      "document.created",
    ]);
    expect(afterRefusal.body.data.document.createdBy).not.toHaveProperty(
      "email",
    );

    const byUploader = await admin
      .post(`${documents()}/${lineageId}/versions`)
      .send({
        fileObjectId: await stage(admin, "Deal-v2.pdf", pdf("v2")),
        status: "draft",
        version: v1Version,
      });
    expect(byUploader.status).toBe(201);
    expect(byUploader.body.data).toMatchObject({
      versionNumber: 2,
      isCurrent: true,
      lineageId,
    });
    // Version 1 stays readable, byte for byte.
    const v1 = (await member.get(`${documents()}/${lineageId}`)).body.data
      .versions[0];
    const bytes = await member.get(`/api/v1/files/${v1.file.id}/content`);
    expect(bytes.status).toBe(200);
    expect(Buffer.compare(bytes.body as Buffer, pdf("v1"))).toBe(0);
  });

  it("a member's own document accepts a member version; an admin may version anyone's", async () => {
    const mine = await member.post(documents()).send({
      fileObjectId: await stage(member, "Mine.pdf", pdf("m1")),
      folder: "general",
      title: "Mine",
      status: "draft",
    });
    const own = await member
      .post(`${documents()}/${mine.body.data.id}/versions`)
      .send({
        fileObjectId: await stage(member, "Mine-v2.pdf", pdf("m2")),
        status: "draft",
        version: mine.body.data.version,
      });
    expect(own.status).toBe(201);
    const byAdmin = await admin
      .post(`${documents()}/${own.body.data.id}/versions`)
      .send({
        fileObjectId: await stage(admin, "Mine-v3.pdf", pdf("m3")),
        status: "draft",
        version: own.body.data.version,
      });
    expect(byAdmin.status).toBe(201);
  });

  it("superseded versions are history: metadata edits and deletion are refused on them", async () => {
    const versions = (await admin.get(`${documents()}/${lineageId}`)).body.data
      .versions;
    const v1 = versions.find(
      (v: { versionNumber: number }) => v.versionNumber === 1,
    );
    const edit = await admin
      .patch(`${documents()}/${v1.id}`)
      .send({ title: "Rewritten history", version: v1.version });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe("NOT_CURRENT_VERSION");
    const del = await admin
      .delete(`${documents()}/${v1.id}`)
      .send({ version: v1.version });
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("NOT_CURRENT_VERSION");
    const again = (await admin.get(`${documents()}/${lineageId}`)).body.data;
    expect(
      again.versions.find(
        (v: { versionNumber: number }) => v.versionNumber === 1,
      ),
    ).toMatchObject({
      title: "Deal",
      version: v1.version,
    });
    expect(await auditActions("document", v1.id)).toEqual(
      ["document.created", "document.version_added"].slice(0, 1),
    );
    // The repository predicate holds even when the service is bypassed.
    const raw = await context.database.client.query(
      "UPDATE documents SET title = 'x' WHERE id = $1 AND is_current = true RETURNING id",
      [v1.id],
    );
    expect(raw.rows).toEqual([]);
  });
});

describe("documents: a script's lineage cannot be erased through the library", () => {
  let scriptId: string;
  let lineage: string;

  it("refuses the lineage delete while the script is live, then allows it once the script is removed", async () => {
    const created = await member.post(scripts()).send({
      fileObjectId: await stage(member, "Script.pdf", pdf("s1")),
      title: "Script",
    });
    expect(created.status).toBe(201);
    scriptId = created.body.data.script.id;
    lineage = created.body.data.script.documentLineageId;
    const current = created.body.data.script.currentVersion;

    const blocked = await admin
      .delete(`${documents()}/${current.id}`)
      .send({ version: current.version });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("DOCUMENT_BACKS_SCRIPT");
    expect((await member.get(`${scripts()}/${scriptId}`)).status).toBe(200);
    expect(await auditActions("document", current.id)).toEqual([
      "document.created",
    ]);

    const forbidden = await admin.get(`${scripts()}/${scriptId}`);
    expect(forbidden.status).toBe(200);
    expect((await member.delete(`${scripts()}/${scriptId}`)).status).toBe(204);
    expect(await auditActions("script", scriptId)).toEqual([
      "script.created",
      "script.deleted",
    ]);

    const afterwards = await admin
      .delete(`${documents()}/${current.id}`)
      .send({ version: current.version });
    expect(afterwards.status).toBe(204);
    expect(await auditActions("document", lineage)).toEqual([
      "document.created",
      "document.deleted",
    ]);
  });

  it("a concurrent or repeated script removal cannot append a second script.deleted", async () => {
    const created = await member.post(scripts()).send({
      fileObjectId: await stage(member, "Twice.pdf", pdf("t1")),
      title: "Twice",
    });
    const id = created.body.data.script.id;
    const results = await Promise.all([
      member.delete(`${scripts()}/${id}`),
      admin.delete(`${scripts()}/${id}`),
    ]);
    expect(results.filter((r) => r.status === 204)).toHaveLength(1);
    expect(results.every((r) => [204, 404, 409].includes(r.status))).toBe(true);
    expect((await member.delete(`${scripts()}/${id}`)).status).toBe(404);
    expect(await auditActions("script", id)).toEqual([
      "script.created",
      "script.deleted",
    ]);
    // The same-instant loser's path: the predicate updates zero rows, which the service turns into 409.
    const again = await withTransaction(context.db, (tx) =>
      scriptRepository.softDelete(tx, { id, deletedAt: new Date() }),
    );
    expect(again).toBeUndefined();
  });
});

describe("scripts: staged-file privacy", () => {
  it("another user's staged non-PDF answers the uniform not-claimable error, never its media type", async () => {
    const adminsText = await stage(
      admin,
      "Private.txt",
      Buffer.from("INT. PRIVATE - DAY\n"),
      "text/plain",
    );
    const probe = await member
      .post(scripts())
      .send({ fileObjectId: adminsText, title: "Probe" });
    expect(probe.status).toBe(422);
    expect(probe.body.error.code).toBe("FILE_NOT_CLAIMABLE");
    expect(JSON.stringify(probe.body)).not.toContain("text/plain");
    // The owner still gets the format answer.
    const own = await admin
      .post(scripts())
      .send({ fileObjectId: adminsText, title: "Own" });
    expect(own.status).toBe(422);
    expect(own.body.error.code).toBe("SCRIPT_FORMAT_UNSUPPORTED");
  });
});

describe("files: malformed filename header", () => {
  it("is a 400 with a request id and stages nothing", async () => {
    const before = (
      await context.database.client.query(
        "SELECT count(*)::int AS n FROM file_objects",
      )
    ).rows[0].n;
    const response = await admin
      .post("/api/v1/files")
      .set("content-type", "application/octet-stream")
      .set("x-vault-filename", "%E0%A4%A")
      .send(pdf("bad"));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_FILENAME_HEADER");
    expect(response.body.error.requestId).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toMatch(/at .*\.ts|URIError/);
    const after = (
      await context.database.client.query(
        "SELECT count(*)::int AS n FROM file_objects",
      )
    ).rows[0].n;
    expect(after).toBe(before);
  });
});

describe("dates: impossible calendar dates", () => {
  it("are refused at validation with no write and no audit event", async () => {
    const right = await member
      .post(`/api/v1/projects/${projectId}/rights`)
      .send({
        rightsType: "book",
        rightsHolder: "Estate",
        expiryDate: "2026-02-30",
      });
    expect(right.status).toBe(400);
    expect(right.body.error.code).toBe("VALIDATION_ERROR");
    expect(
      (
        await context.database.client.query(
          "SELECT count(*)::int AS n FROM project_rights WHERE project_id = $1",
          [projectId],
        )
      ).rows[0].n,
    ).toBe(0);
    const leap = await member
      .post(`/api/v1/projects/${projectId}/rights`)
      .send({
        rightsType: "book",
        rightsHolder: "Estate",
        expiryDate: "2028-02-29",
      });
    expect(leap.status).toBe(201);
    expect(leap.body.data.expiryDate).toBe("2028-02-29");
  });
});

describe("create-time uniqueness races", () => {
  it("concurrent budget creation: one wins, the rest get the domain 409, never 500", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        member.post(budget()).send({ currency: "GBP" }),
      ),
    );
    expect(statuses(results)).toEqual([201, 409, 409, 409, 409]);
    for (const r of results)
      if (r.status === 409) expect(r.body.error.code).toBe("BUDGET_EXISTS");
    const count = (
      await context.database.client.query(
        "SELECT count(*)::int AS n FROM budgets WHERE project_id = $1",
        [projectId],
      )
    ).rows[0].n;
    expect(count).toBe(1);
    expect(
      (
        await context.database.client.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE action = 'budget.created'",
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it("concurrent territory creation with the same name: one wins, the rest get TERRITORY_NAME_TAKEN", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        (i % 2 ? admin : member)
          .post(`/api/v1/projects/${projectId}/distribution/territories`)
          .send({ name: "Japan" }),
      ),
    );
    expect(statuses(results)).toEqual([201, 409, 409, 409, 409]);
    for (const r of results)
      if (r.status === 409)
        expect(r.body.error.code).toBe("TERRITORY_NAME_TAKEN");
  });

  it("concurrent first reviews by one author: one submit, the rest a clean conflict", async () => {
    const body = {
      version: 0,
      scores: { script: 7, director: 7, cast: 7, financing: 7 },
      summary: "Solid",
      summaryNotes: "Solid",
    };
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        member.put(`/api/v1/projects/${projectId}/reviews/mine`).send(body),
      ),
    );
    expect(
      results.every(
        (r) => r.status === 200 || r.status === 201 || r.status === 409,
      ),
    ).toBe(true);
    expect(results.filter((r) => r.status < 300)).toHaveLength(1);
    for (const r of results)
      if (r.status === 409) expect(r.body.error.code).toBe("VERSION_CONFLICT");
  });
});

describe("budget: revision race and locked-history guards", () => {
  let lockedVersionId: string;
  let lockedLineItemId: string;

  it("serialises concurrent revision starts: one draft, the rest BUDGET_VERSION_ALREADY_OPEN", async () => {
    const current = (await member.get(budget())).body.data.currentVersion;
    const production = current.departments.find(
      (d: { name: string }) => d.name === "Production",
    );
    const item = await member
      .post(`${budget()}/departments/${production.id}/line-items`)
      .send({ name: "Crew", amount: "10.00" });
    lockedLineItemId = item.body.data.departments.find(
      (d: { name: string }) => d.name === "Production",
    ).lineItems[0].id;
    const fresh = (await member.get(budget())).body.data.currentVersion;
    const submitted = await member
      .post(`${budget()}/versions/${fresh.id}/submit`)
      .send({ version: fresh.version });
    const locked = await admin
      .post(`${budget()}/versions/${fresh.id}/lock`)
      .send({ version: submitted.body.data.currentVersion.version });
    expect(locked.status).toBe(200);
    lockedVersionId = fresh.id;

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        (i % 2 ? admin : member).post(
          `${budget()}/versions/${lockedVersionId}/revisions`,
        ),
      ),
    );
    expect(statuses(results)).toEqual([201, 409, 409, 409, 409]);
    for (const r of results)
      if (r.status === 409)
        expect(r.body.error.code).toBe("BUDGET_VERSION_ALREADY_OPEN");
    const versions = (await member.get(budget())).body.data.versions;
    expect(
      versions.map((v: { versionNumber: number; status: string }) => [
        v.versionNumber,
        v.status,
      ]),
    ).toEqual([
      [2, "draft"],
      [1, "locked"],
    ]);
    expect(
      (
        await context.database.client.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE action = 'budget_version.created'",
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it("the repository refuses to physically delete locked-version content and approved sources", async () => {
    const lockedItem = (
      await context.database.client.query(
        "SELECT version FROM budget_line_items WHERE id = $1",
        [lockedLineItemId],
      )
    ).rows[0];
    const deleted = await withTransaction(context.db, (tx) =>
      budgetLineItemRepository.delete(tx, {
        id: lockedLineItemId,
        expectedVersion: lockedItem.version,
      }),
    );
    expect(deleted).toBe(false);
    expect(
      (
        await context.database.client.query(
          "SELECT 1 FROM budget_line_items WHERE id = $1",
          [lockedLineItemId],
        )
      ).rows,
    ).toHaveLength(1);

    const plan = await member
      .post(`/api/v1/projects/${projectId}/finance-plan`)
      .send({ budgetVersionId: lockedVersionId });
    expect(plan.status).toBe(201);
    const source = await member
      .post(`/api/v1/projects/${projectId}/finance-plan/sources`)
      .send({ name: "Equity", amount: "5.00", type: "equity" });
    const sourceId = source.body.data.sources[0].id;
    const approved = await admin
      .post(
        `/api/v1/projects/${projectId}/finance-plan/sources/${sourceId}/approve`,
      )
      .send({ version: 1 });
    expect(approved.status).toBe(200);
    const removed = await withTransaction(context.db, (tx) =>
      financeSourceRepository.delete(tx, { id: sourceId, expectedVersion: 2 }),
    );
    expect(removed).toBe(false);
    expect(
      (
        await context.database.client.query(
          "SELECT status FROM finance_sources WHERE id = $1",
          [sourceId],
        )
      ).rows[0].status,
    ).toBe("approved");
  });
});

describe("database: lifecycle constraints added in phase 1", () => {
  it("file_objects status must agree with its timestamps", async () => {
    const [{ id }] = (
      await context.database.client.query(
        "SELECT id FROM file_objects WHERE status = 'available' LIMIT 1",
      )
    ).rows;
    await expect(
      context.database.client.query(
        "UPDATE file_objects SET status = 'staged' WHERE id = $1",
        [id],
      ),
    ).rejects.toThrow(/file_objects_status_matches_timestamps/);
    await expect(
      context.database.client.query(
        "UPDATE file_objects SET status = 'deleted' WHERE id = $1",
        [id],
      ),
    ).rejects.toThrow(/file_objects_status_matches_timestamps/);
  });

  it("stage history transitions are an enum", async () => {
    const [{ id }] = (
      await context.database.client.query(
        "SELECT actor_user_id AS id FROM project_stage_history LIMIT 1",
      )
    ).rows;
    await expect(
      context.database.client.query(
        "INSERT INTO project_stage_history (project_id, to_stage, transition_type, actor_user_id, request_id) VALUES ($1, 'evaluation', 'teleported', $2, gen_random_uuid())",
        [projectId, id],
      ),
    ).rejects.toThrow(/invalid input value for enum/);
  });
});

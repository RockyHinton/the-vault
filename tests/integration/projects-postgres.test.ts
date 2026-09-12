import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bootstrapIdentity,
  createTestContext,
  type TestContext,
} from "../support/test-context";

let context: TestContext;
let app: Express;

const countRows = async (table: "audit_events" | "project_stage_history") =>
  (
    await context.database.client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${table}`,
    )
  ).rows[0].count;

const createProject = async (title: string) => {
  const created = await request(app).post("/api/v1/projects").send({ title });
  expect(created.status).toBe(201);
  return created.body.data as { id: string; version: number; stage: string };
};

beforeAll(async () => {
  context = await createTestContext({
    bootstrapAdminClerkId: bootstrapIdentity.clerkUserId,
  });
  app = await context.appFor(bootstrapIdentity);
});

afterAll(async () => {
  await context.destroy();
});

describe("Projects API against an isolated PostgreSQL database", () => {
  it("persists lifecycle and audit history atomically with optimistic concurrency", async () => {
    const me = await request(app).get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.role).toBe("studio_admin");

    const invalidId = await request(app).get("/api/v1/projects/not-a-uuid");
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe("VALIDATION_ERROR");
    expect(invalidId.body.error.details.fieldErrors.projectId).toBeDefined();

    // Database-level invariants hold even for writes that bypass the API.
    await expect(
      context.database.client.query(
        "INSERT INTO projects (title, created_by_user_id, version) VALUES ($1, $2, 0)",
        ["Invalid version", me.body.data.user.id],
      ),
    ).rejects.toThrow();
    await expect(
      context.database.client.query(
        "INSERT INTO projects (title, created_by_user_id, archived_at, version) VALUES ($1, $2, now(), 1)",
        ["Invalid archive", me.body.data.user.id],
      ),
    ).rejects.toThrow();

    const invalid = await request(app)
      .post("/api/v1/projects")
      .send({ title: "" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");

    const created = await request(app)
      .post("/api/v1/projects")
      .send({ title: "A Durable Project", genre: "Drama" });
    expect(created.status).toBe(201);
    const project = created.body.data;
    expect(project.version).toBe(1);

    const updated = await request(app)
      .patch(`/api/v1/projects/${project.id}`)
      .send({ version: 1, logline: "A real persisted project." });
    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(2);

    // A stale write is rejected and leaves no audit or history rows behind.
    const auditBefore = await countRows("audit_events");
    const historyBefore = await countRows("project_stage_history");
    const conflict = await request(app)
      .patch(`/api/v1/projects/${project.id}`)
      .send({ version: 1, logline: "Stale write" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("VERSION_CONFLICT");
    const staleTransition = await request(app)
      .post(`/api/v1/projects/${project.id}/stage-transitions`)
      .send({ version: 1, toStage: "development" });
    expect(staleTransition.status).toBe(409);
    expect(await countRows("audit_events")).toBe(auditBefore);
    expect(await countRows("project_stage_history")).toBe(historyBefore);

    const transitioned = await request(app)
      .post(`/api/v1/projects/${project.id}/stage-transitions`)
      .send({ version: 2, toStage: "development" });
    expect(transitioned.status).toBe(200);
    expect(transitioned.body.data.version).toBe(3);

    const archived = await request(app)
      .post(`/api/v1/projects/${project.id}/archive`)
      .send({
        version: 3,
        reason: "financing_not_secured",
        revisit: "maybe",
        starred: true,
      });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).toBeTruthy();
    expect(archived.body.data.archive.archivedFromStage).toBe("development");

    const restored = await request(app)
      .post(`/api/v1/projects/${project.id}/restore`)
      .send({ version: 4 });
    expect(restored.status).toBe(200);
    expect(restored.body.data.stage).toBe("development");
    expect(restored.body.data.archive).toBeNull();

    const deleted = await request(app)
      .delete(`/api/v1/projects/${project.id}`)
      .send({ version: 5 });
    expect(deleted.status).toBe(204);

    const history = await context.database.client.query(
      "SELECT transition_type, from_stage, to_stage FROM project_stage_history WHERE project_id = $1 ORDER BY created_at",
      [project.id],
    );
    expect(history.rows).toEqual([
      { transition_type: "created", from_stage: null, to_stage: "evaluation" },
      {
        transition_type: "stage_changed",
        from_stage: "evaluation",
        to_stage: "development",
      },
      {
        transition_type: "archived",
        from_stage: "development",
        to_stage: "development",
      },
      {
        transition_type: "restored",
        from_stage: "development",
        to_stage: "development",
      },
    ]);
    const audit = await context.database.client.query(
      "SELECT action FROM audit_events WHERE entity_id = $1 ORDER BY created_at",
      [project.id],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      "project.created",
      "project.updated",
      "project.stage_changed",
      "project.archived",
      "project.restored",
      "project.deleted",
    ]);
  });

  it("rejects invalid stage transitions with 422 and writes nothing", async () => {
    const project = await createProject("Cannot Skip");
    const auditBefore = await countRows("audit_events");
    const skipped = await request(app)
      .post(`/api/v1/projects/${project.id}/stage-transitions`)
      .send({ version: project.version, toStage: "production" });
    expect(skipped.status).toBe(422);
    expect(skipped.body.error.code).toBe("INVALID_STAGE_TRANSITION");
    const backwards = await request(app)
      .post(`/api/v1/projects/${project.id}/stage-transitions`)
      .send({ version: project.version, toStage: "evaluation" });
    expect(backwards.status).toBe(422);
    expect(await countRows("audit_events")).toBe(auditBefore);
    const unchanged = await request(app).get(`/api/v1/projects/${project.id}`);
    expect(unchanged.body.data.version).toBe(project.version);
  });

  it("refuses edits and stage changes while archived, and restore when not archived", async () => {
    const project = await createProject("Frozen");
    const notArchived = await request(app)
      .post(`/api/v1/projects/${project.id}/restore`)
      .send({ version: project.version });
    expect(notArchived.status).toBe(409);
    expect(notArchived.body.error.code).toBe("PROJECT_NOT_ARCHIVED");

    const archived = await request(app)
      .post(`/api/v1/projects/${project.id}/archive`)
      .send({
        version: project.version,
        reason: "withdrawn",
        revisit: "no",
        starred: false,
      });
    expect(archived.status).toBe(200);
    const version = archived.body.data.version;

    const edit = await request(app)
      .patch(`/api/v1/projects/${project.id}`)
      .send({ version, title: "Renamed while archived" });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe("PROJECT_ARCHIVED");
    const transition = await request(app)
      .post(`/api/v1/projects/${project.id}/stage-transitions`)
      .send({ version, toStage: "development" });
    expect(transition.status).toBe(409);
    expect(transition.body.error.code).toBe("PROJECT_ARCHIVED");
    const again = await request(app)
      .post(`/api/v1/projects/${project.id}/archive`)
      .send({ version, reason: "withdrawn", revisit: "no", starred: false });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("PROJECT_ALREADY_ARCHIVED");
  });

  it("filters archived projects and paginates with a cursor", async () => {
    const titles = ["Page A", "Page B", "Page C"];
    const created = [];
    for (const title of titles) created.push(await createProject(title));
    const toArchive = created[0];
    const archived = await request(app)
      .post(`/api/v1/projects/${toArchive.id}/archive`)
      .send({
        version: toArchive.version,
        reason: "creative_pass",
        revisit: "yes",
        starred: false,
      });
    expect(archived.status).toBe(200);

    const active = await request(app).get("/api/v1/projects?archived=false");
    const activeIds = active.body.data.items.map(
      (item: { id: string }) => item.id,
    );
    expect(activeIds).not.toContain(toArchive.id);
    expect(activeIds).toEqual(
      expect.arrayContaining([created[1].id, created[2].id]),
    );

    const onlyArchived = await request(app).get(
      "/api/v1/projects?archived=true",
    );
    expect(
      onlyArchived.body.data.items.every(
        (item: { archivedAt: string | null }) => item.archivedAt,
      ),
    ).toBe(true);
    expect(
      onlyArchived.body.data.items.map((item: { id: string }) => item.id),
    ).toContain(toArchive.id);

    // Walk the full active list one item at a time; every page links to the next.
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await request(app).get(
        `/api/v1/projects?archived=all&limit=1${cursor ? `&cursor=${cursor}` : ""}`,
      );
      expect(page.status).toBe(200);
      expect(page.body.data.items).toHaveLength(1);
      seen.push(page.body.data.items[0].id);
      cursor = page.body.data.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(
      expect.arrayContaining(created.map((item) => item.id)),
    );

    const badCursor = await request(app).get("/api/v1/projects?cursor=nope");
    expect(badCursor.status).toBe(400);
  });

  it("hides soft-deleted projects from every read and write", async () => {
    const project = await createProject("Gone");
    const deleted = await request(app)
      .delete(`/api/v1/projects/${project.id}`)
      .send({ version: project.version });
    expect(deleted.status).toBe(204);

    const read = await request(app).get(`/api/v1/projects/${project.id}`);
    expect(read.status).toBe(404);
    expect(read.body.error.code).toBe("PROJECT_NOT_FOUND");
    const listed = await request(app).get("/api/v1/projects?archived=all");
    expect(
      listed.body.data.items.map((item: { id: string }) => item.id),
    ).not.toContain(project.id);
    const edit = await request(app)
      .patch(`/api/v1/projects/${project.id}`)
      .send({ version: project.version + 1, title: "Back from the dead" });
    expect(edit.status).toBe(404);
    const deleteAgain = await request(app)
      .delete(`/api/v1/projects/${project.id}`)
      .send({ version: project.version + 1 });
    expect(deleteAgain.status).toBe(404);

    // The row itself survives for provenance.
    const row = await context.database.client.query(
      "SELECT deleted_at FROM projects WHERE id = $1",
      [project.id],
    );
    expect(row.rows[0].deleted_at).toBeTruthy();
  });
});

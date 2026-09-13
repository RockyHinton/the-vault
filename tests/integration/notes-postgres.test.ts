import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminCredentials,
  createTestContext,
  memberCredentials,
  type TestContext,
} from "../support/test-context";

let context: TestContext;
let admin: Awaited<ReturnType<TestContext["loginAs"]>>;
let member: Awaited<ReturnType<TestContext["loginAs"]>>;
let projectId: string;

const auditActions = async (entityId: string) =>
  (
    await context.database.client.query(
      "SELECT action FROM audit_events WHERE entity_type = 'project_note' AND entity_id = $1 ORDER BY created_at",
      [entityId],
    )
  ).rows.map((row: { action: string }) => row.action);

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  const project = await admin.post("/api/v1/projects").send({ title: "Noted" });
  projectId = project.body.data.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("project notes", () => {
  it("any active user posts; the author comes from the session and lists newest first", async () => {
    const first = await member
      .post(`/api/v1/projects/${projectId}/notes`)
      .send({ body: "First thought", category: "script" });
    expect(first.status).toBe(201);
    expect(first.body.data.author).toEqual({
      id: expect.any(String),
      displayName: expect.any(String),
    });
    const second = await admin
      .post(`/api/v1/projects/${projectId}/notes`)
      .send({ body: "Second thought", category: "financing" });
    expect(second.status).toBe(201);

    const list = await member.get(`/api/v1/projects/${projectId}/notes`);
    expect(
      list.body.data.items.map((note: { body: string }) => note.body),
    ).toEqual(["Second thought", "First thought"]);
    expect(await auditActions(first.body.data.id)).toEqual(["note.created"]);
  });

  it("rejects blank bodies and unknown categories", async () => {
    const blank = await member
      .post(`/api/v1/projects/${projectId}/notes`)
      .send({ body: "   ", category: "script" });
    expect(blank.status).toBe(400);
    const category = await member
      .post(`/api/v1/projects/${projectId}/notes`)
      .send({ body: "x", category: "gossip" });
    expect(category.status).toBe(400);
  });

  it("author edits their own note with a version; others are refused; admins may", async () => {
    const list = await member.get(`/api/v1/projects/${projectId}/notes`);
    const mine = list.body.data.items.find(
      (note: { body: string }) => note.body === "First thought",
    );
    const theirs = list.body.data.items.find(
      (note: { body: string }) => note.body === "Second thought",
    );

    const forbidden = await member
      .patch(`/api/v1/projects/${projectId}/notes/${theirs.id}`)
      .send({ body: "Hijacked", version: theirs.version });
    expect(forbidden.status).toBe(403);

    const stale = await member
      .patch(`/api/v1/projects/${projectId}/notes/${mine.id}`)
      .send({ body: "Edited", version: mine.version + 1 });
    expect(stale.status).toBe(409);

    const edited = await member
      .patch(`/api/v1/projects/${projectId}/notes/${mine.id}`)
      .send({ body: "Edited", category: "cast", version: mine.version });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      body: "Edited",
      category: "cast",
      version: 2,
    });

    const byAdmin = await admin
      .patch(`/api/v1/projects/${projectId}/notes/${mine.id}`)
      .send({ category: "other", version: 2 });
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data.author.id).toBe(mine.author.id);
    expect(await auditActions(mine.id)).toEqual([
      "note.created",
      "note.updated",
      "note.updated",
    ]);
  });

  it("deletes are author-or-admin, versioned, and hide the note without losing the row", async () => {
    const list = await admin.get(`/api/v1/projects/${projectId}/notes`);
    const adminNote = list.body.data.items.find(
      (note: { body: string }) => note.body === "Second thought",
    );
    const memberNote = list.body.data.items.find(
      (note: { body: string }) => note.body === "Edited",
    );

    const forbidden = await member
      .delete(`/api/v1/projects/${projectId}/notes/${adminNote.id}`)
      .send({ version: adminNote.version });
    expect(forbidden.status).toBe(403);
    const own = await member
      .delete(`/api/v1/projects/${projectId}/notes/${memberNote.id}`)
      .send({ version: memberNote.version });
    expect(own.status).toBe(204);
    const byAdmin = await admin
      .delete(`/api/v1/projects/${projectId}/notes/${adminNote.id}`)
      .send({ version: adminNote.version });
    expect(byAdmin.status).toBe(204);

    const after = await admin.get(`/api/v1/projects/${projectId}/notes`);
    expect(after.body.data.items).toEqual([]);
    const gone = await member
      .patch(`/api/v1/projects/${projectId}/notes/${memberNote.id}`)
      .send({ body: "Zombie", version: memberNote.version + 1 });
    expect(gone.status).toBe(404);
    const rows = await context.database.client.query(
      "SELECT count(*)::int AS n FROM project_notes WHERE project_id = $1 AND deleted_at IS NOT NULL",
      [projectId],
    );
    expect(rows.rows[0].n).toBe(2);
    expect(await auditActions(memberNote.id)).toContain("note.deleted");
  });
});

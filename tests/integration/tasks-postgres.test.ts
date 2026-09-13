import request from "supertest";
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
let memberId: string;
let adminId: string;

const auditActions = async (entityId: string) =>
  (
    await context.database.client.query(
      "SELECT action FROM audit_events WHERE entity_type = 'project_task' AND entity_id = $1 ORDER BY created_at",
      [entityId],
    )
  ).rows.map((row: { action: string }) => row.action);

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
  const project = await admin
    .post("/api/v1/projects")
    .send({ title: "Tasked" });
  projectId = project.body.data.id;
  const me = await member.get("/api/v1/auth/me");
  memberId = me.body.data.user.id;
  adminId = (await admin.get("/api/v1/auth/me")).body.data.user.id;
});

afterAll(async () => {
  await context.destroy();
});

describe("user directory", () => {
  it("lists active users as safe references for any signed-in user", async () => {
    const response = await member.get("/api/v1/users/directory");
    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual(
      expect.arrayContaining([
        { id: memberId, displayName: expect.any(String) },
        { id: adminId, displayName: expect.any(String) },
      ]),
    );
    for (const item of response.body.data.items) {
      expect(item).not.toHaveProperty("email");
      expect(item).not.toHaveProperty("role");
    }
    const anonymous = await request(await context.newApp()).get(
      "/api/v1/users/directory",
    );
    expect(anonymous.status).toBe(401);
    const adminOnly = await member.get("/api/v1/users");
    expect(adminOnly.status).toBe(403);
  });
});

describe("project tasks", () => {
  it("any user creates a task assigned to a real active user; defaults apply", async () => {
    const created = await member
      .post(`/api/v1/projects/${projectId}/tasks`)
      .send({
        title: "Chase the bond company",
        description: "",
        assigneeUserId: adminId,
      });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      title: "Chase the bond company",
      description: null,
      category: "general",
      priority: "medium",
      status: "open",
      assignee: { id: adminId, displayName: expect.any(String) },
      createdBy: { id: memberId },
      completedAt: null,
      version: 1,
    });
    expect(await auditActions(created.body.data.id)).toEqual(["task.created"]);
  });

  it("refuses assignment to unknown or suspended users", async () => {
    const unknown = await member
      .post(`/api/v1/projects/${projectId}/tasks`)
      .send({
        title: "Ghost",
        assigneeUserId: "00000000-0000-4000-8000-000000000000",
      });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe("ASSIGNEE_NOT_ASSIGNABLE");

    const suspendable = await admin.post("/api/v1/users").send({
      email: "gone@vault.test",
      displayName: "Gone Person",
      password: "Gone-Password-2026-strong",
      role: "user",
    });
    expect(suspendable.status).toBe(201);
    const suspended = await admin
      .post(`/api/v1/users/${suspendable.body.data.id}/suspend`)
      .send({ version: suspendable.body.data.version });
    expect(suspended.status).toBe(200);
    const refused = await member
      .post(`/api/v1/projects/${projectId}/tasks`)
      .send({
        title: "To a suspended user",
        assigneeUserId: suspendable.body.data.id,
      });
    expect(refused.status).toBe(422);
    const directory = await member.get("/api/v1/users/directory");
    expect(
      directory.body.data.items.some(
        (item: { id: string }) => item.id === suspendable.body.data.id,
      ),
    ).toBe(false);
  });

  it("moves status only through explicit commands with versions and keeps completed_at consistent", async () => {
    const list = await member.get(`/api/v1/projects/${projectId}/tasks`);
    const task = list.body.data.items[0];

    const wrongVersion = await admin
      .post(`/api/v1/projects/${projectId}/tasks/${task.id}/complete`)
      .send({ version: task.version + 1 });
    expect(wrongVersion.status).toBe(409);

    const done = await admin
      .post(`/api/v1/projects/${projectId}/tasks/${task.id}/complete`)
      .send({ version: task.version });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe("done");
    expect(done.body.data.completedAt).toEqual(expect.any(String));
    expect(done.body.data.version).toBe(task.version + 1);

    const twice = await admin
      .post(`/api/v1/projects/${projectId}/tasks/${task.id}/complete`)
      .send({ version: done.body.data.version });
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe("TASK_ALREADY_DONE");

    const reopened = await member
      .post(`/api/v1/projects/${projectId}/tasks/${task.id}/reopen`)
      .send({ version: done.body.data.version });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data).toMatchObject({
      status: "open",
      completedAt: null,
    });

    const patchStatus = await member
      .patch(`/api/v1/projects/${projectId}/tasks/${task.id}`)
      .send({ status: "done", version: reopened.body.data.version });
    expect(patchStatus.status).toBe(400);

    await expect(
      context.database.client.query(
        "UPDATE project_tasks SET status = 'done' WHERE id = $1",
        [task.id],
      ),
    ).rejects.toThrow(/project_tasks_completed_at_matches_status/);
    expect(await auditActions(task.id)).toEqual([
      "task.created",
      "task.completed",
      "task.reopened",
    ]);
  });

  it("reassignment is collaborative; editing text and deleting are creator-or-admin", async () => {
    const created = await admin
      .post(`/api/v1/projects/${projectId}/tasks`)
      .send({ title: "Admin task", category: "legal", priority: "high" });
    const task = created.body.data;

    const reassigned = await member
      .patch(`/api/v1/projects/${projectId}/tasks/${task.id}`)
      .send({ assigneeUserId: memberId, version: task.version });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.data.assignee.id).toBe(memberId);

    const retitled = await member
      .patch(`/api/v1/projects/${projectId}/tasks/${task.id}`)
      .send({ title: "Mine now", version: reassigned.body.data.version });
    expect(retitled.status).toBe(403);

    const deleted = await member
      .delete(`/api/v1/projects/${projectId}/tasks/${task.id}`)
      .send({ version: reassigned.body.data.version });
    expect(deleted.status).toBe(403);

    const byAdmin = await admin
      .patch(`/api/v1/projects/${projectId}/tasks/${task.id}`)
      .send({
        title: "Renamed",
        description: null,
        version: reassigned.body.data.version,
      });
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data).toMatchObject({ title: "Renamed", version: 3 });

    const removed = await admin
      .delete(`/api/v1/projects/${projectId}/tasks/${task.id}`)
      .send({ version: 3 });
    expect(removed.status).toBe(204);
    const after = await admin.get(`/api/v1/projects/${projectId}/tasks`);
    expect(
      after.body.data.items.map((item: { id: string }) => item.id),
    ).not.toContain(task.id);
    expect(await auditActions(task.id)).toEqual([
      "task.created",
      "task.updated",
      "task.updated",
      "task.deleted",
    ]);
  });
});

import { createServer } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../server/db/client";
import { errorHandler } from "../../server/http/errors";
import { createApp } from "../../server/index";
import { registerRoutes } from "../../server/routes";
import { createIsolatedPostgresDatabase } from "../support/isolated-postgres";

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_SCHEMA: process.env.DATABASE_SCHEMA,
  VAULT_BOOTSTRAP_ADMIN_CLERK_ID: process.env.VAULT_BOOTSTRAP_ADMIN_CLERK_ID,
};
const bootstrapIdentity = { clerkUserId: "user_bootstrap", email: "admin@vault.test", displayName: "Test Admin" };
let database: Awaited<ReturnType<typeof createIsolatedPostgresDatabase>>;

async function appFor(identity = bootstrapIdentity) {
  const app = createApp({ verifiedIdentity: identity });
  await registerRoutes(createServer(app), app, { requireLocalUser: app.locals.requireLocalUser });
  app.use(errorHandler);
  return app;
}

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.VAULT_BOOTSTRAP_ADMIN_CLERK_ID = bootstrapIdentity.clerkUserId;
  database = await createIsolatedPostgresDatabase();
  process.env.DATABASE_URL = database.databaseUrl;
  delete process.env.DATABASE_SCHEMA;
});

afterAll(async () => {
  await closeDatabase();
  if (database) await database.destroy();
  process.env.NODE_ENV = originalEnvironment.NODE_ENV;
  process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
  process.env.DATABASE_SCHEMA = originalEnvironment.DATABASE_SCHEMA;
  process.env.VAULT_BOOTSTRAP_ADMIN_CLERK_ID = originalEnvironment.VAULT_BOOTSTRAP_ADMIN_CLERK_ID;
});

describe("Projects API against a schema-isolated PostgreSQL database", () => {
  it("persists lifecycle and audit history atomically with optimistic concurrency", async () => {
    const app = await appFor();

    const me = await request(app).get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.role).toBe("studio_admin");
    const invalidId = await request(app).get("/api/v1/projects/not-a-uuid");
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe("VALIDATION_ERROR");
    await expect(
      database.client.query(
        "INSERT INTO projects (title, created_by_user_id, version) VALUES ($1, $2, 0)",
        ["Invalid version", me.body.data.user.id],
      ),
    ).rejects.toThrow();
    await expect(
      database.client.query(
        "INSERT INTO projects (title, created_by_user_id, archived_at, version) VALUES ($1, $2, now(), 1)",
        ["Invalid archive", me.body.data.user.id],
      ),
    ).rejects.toThrow();

    const invalid = await request(app).post("/api/v1/projects").send({ title: "" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");

    const created = await request(app).post("/api/v1/projects").send({ title: "A Durable Project", genre: "Drama" });
    expect(created.status).toBe(201);
    const project = created.body.data;
    expect(project.version).toBe(1);

    const updated = await request(app)
      .patch(`/api/v1/projects/${project.id}`)
      .send({ version: 1, logline: "A real persisted project." });
    expect(updated.status).toBe(200);
    expect(updated.body.data.version).toBe(2);

    const auditBeforeConflict = await database.client.query("SELECT count(*)::int AS count FROM audit_events");
    const conflict = await request(app)
      .patch(`/api/v1/projects/${project.id}`)
      .send({ version: 1, logline: "Stale write" });
    expect(conflict.status).toBe(409);
    const auditAfterConflict = await database.client.query("SELECT count(*)::int AS count FROM audit_events");
    expect(auditAfterConflict.rows[0].count).toBe(auditBeforeConflict.rows[0].count);

    const transitioned = await request(app)
      .post(`/api/v1/projects/${project.id}/stage-transitions`)
      .send({ version: 2, toStage: "development" });
    expect(transitioned.status).toBe(200);
    expect(transitioned.body.data.version).toBe(3);

    const archived = await request(app).post(`/api/v1/projects/${project.id}/archive`).send({
      version: 3,
      reason: "financing_not_secured",
      revisit: "maybe",
      starred: true,
    });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).toBeTruthy();

    const restored = await request(app).post(`/api/v1/projects/${project.id}/restore`).send({ version: 4 });
    expect(restored.status).toBe(200);
    expect(restored.body.data.stage).toBe("development");

    const deleted = await request(app).delete(`/api/v1/projects/${project.id}`).send({ version: 5 });
    expect(deleted.status).toBe(204);
    const listed = await request(app).get("/api/v1/projects");
    expect(listed.body.data.items).toEqual([]);

    const history = await database.client.query("SELECT transition_type FROM project_stage_history ORDER BY created_at");
    expect(history.rows.map((row) => row.transition_type)).toEqual(["created", "stage_changed", "archived", "restored"]);
    const audit = await database.client.query("SELECT action FROM audit_events ORDER BY created_at");
    expect(audit.rows.map((row) => row.action)).toContain("project.deleted");
  });

  it("enforces local account status and studio-admin authorization", async () => {
    await database.client.query(
      "INSERT INTO application_users (clerk_user_id, email, role, status) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)",
      ["user_member", "member@vault.test", "user", "active", "user_suspended", "suspended@vault.test", "user", "suspended"],
    );
    const memberApp = await appFor({ clerkUserId: "user_member", email: "member@vault.test", displayName: "Member" });
    const denied = await request(memberApp).post("/api/v1/projects").send({ title: "Forbidden" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");

    const suspendedApp = await appFor({
      clerkUserId: "user_suspended",
      email: "suspended@vault.test",
      displayName: "Suspended",
    });
    const suspended = await request(suspendedApp).get("/api/v1/auth/me");
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe("ACCOUNT_SUSPENDED");
  });
});
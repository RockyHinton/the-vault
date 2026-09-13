import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createVaultServer } from "../../server/app";
import { createDatabase, type DatabaseHandle } from "../../server/db/client";
import {
  BootstrapRefusedError,
  bootstrapStudioAdmin,
} from "../../server/modules/users/bootstrap-admin";
import {
  createIsolatedPostgresDatabase,
  type IsolatedPostgresDatabase,
} from "../support/isolated-postgres";
import { testEnvironment } from "../support/test-context";

// A fresh database with no users at all, exactly like a first deployment.
let database: IsolatedPostgresDatabase;
let handle: DatabaseHandle;
const password = "First-Admin-Password-2026";

beforeAll(async () => {
  database = await createIsolatedPostgresDatabase();
  handle = createDatabase({
    databaseUrl: database.databaseUrl,
    nodeEnv: "test",
  });
});

afterAll(async () => {
  await handle.close();
  await database.destroy();
});

const run = (email: string, displayName = "Operator") =>
  bootstrapStudioAdmin(
    { db: handle.db },
    { email, password, displayName, requestId: randomUUID() },
  );

describe("first-admin bootstrap", () => {
  it("creates an active studio_admin with a hashed credential and one audit row, then is a no-op", async () => {
    const first = await run("Operator@Vault.test");
    expect(first.outcome).toBe("created");
    if (first.outcome !== "created") return;

    const users = await database.client.query(
      "SELECT email, role, status FROM application_users",
    );
    expect(users.rows).toEqual([
      { email: "operator@vault.test", role: "studio_admin", status: "active" },
    ]);
    const credential = await database.client.query(
      "SELECT password_hash FROM user_credentials WHERE user_id = $1",
      [first.userId],
    );
    expect(credential.rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(credential.rows[0].password_hash).not.toContain(password);
    const audit = await database.client.query(
      "SELECT action, actor_user_id, entity_id, metadata FROM audit_events",
    );
    expect(audit.rows).toEqual([
      {
        action: "user.bootstrap_admin_created",
        actor_user_id: first.userId,
        entity_id: first.userId,
        metadata: { role: "studio_admin", source: "bootstrap:admin" },
      },
    ]);
    const dump = await database.client.query(
      "SELECT row_to_json(u)::text AS t FROM application_users u UNION ALL SELECT row_to_json(c)::text FROM user_credentials c UNION ALL SELECT row_to_json(a)::text FROM audit_events a",
    );
    expect(dump.rows.map((r) => r.t).join("\n")).not.toContain(password);

    const second = await run("operator@vault.test");
    expect(second).toEqual({
      outcome: "already_bootstrapped",
      userId: first.userId,
    });
    expect(
      (
        await database.client.query(
          "SELECT count(*)::int AS c FROM audit_events",
        )
      ).rows[0].c,
    ).toBe(1);

    // The bootstrapped admin can sign in with the bootstrap password.
    const { app } = await createVaultServer({
      env: testEnvironment({ DATABASE_URL: database.databaseUrl }),
      db: handle.db,
      frontend: "none",
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "operator@vault.test", password });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe("studio_admin");
  });

  it("refuses to overwrite a user that exists with another role or status", async () => {
    await database.client.query(
      "UPDATE application_users SET role = 'user' WHERE email = 'operator@vault.test'",
    );
    await expect(run("operator@vault.test")).rejects.toThrow(
      BootstrapRefusedError,
    );
    await database.client.query(
      "UPDATE application_users SET role = 'studio_admin', status = 'suspended' WHERE email = 'operator@vault.test'",
    );
    await expect(run("operator@vault.test")).rejects.toThrow(
      /will not change it/,
    );
    // Neither refusal touched the credential.
    const credential = await database.client.query(
      "SELECT count(*)::int AS c FROM user_credentials",
    );
    expect(credential.rows[0].c).toBe(1);
  });
});

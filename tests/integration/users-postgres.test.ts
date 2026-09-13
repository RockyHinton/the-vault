import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  adminCredentials,
  createTestContext,
  memberCredentials,
  type TestContext,
} from "../support/test-context";

let context: TestContext;
let admin: Awaited<ReturnType<TestContext["loginAs"]>>;
let member: Awaited<ReturnType<TestContext["loginAs"]>>;

const auditRows = async (action: string, entityId?: string) =>
  (
    await context.database.client.query(
      `SELECT actor_user_id, entity_id, metadata FROM audit_events WHERE action = $1${entityId ? " AND entity_id = $2" : ""} ORDER BY created_at`,
      entityId ? [action, entityId] : [action],
    )
  ).rows;

beforeAll(async () => {
  context = await createTestContext();
  admin = await context.loginAs(adminCredentials);
  member = await context.loginAs(memberCredentials);
});

afterAll(async () => {
  await context.destroy();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Users & Access API against an isolated PostgreSQL database", () => {
  it("lets a studio_admin list users and refuses ordinary users everywhere", async () => {
    const list = await admin.get("/api/v1/users");
    expect(list.status).toBe(200);
    const emails = list.body.data.items.map((u: { email: string }) => u.email);
    expect(emails).toEqual(["admin@vault.test", "member@vault.test"]);
    expect(JSON.stringify(list.body)).not.toMatch(/password|hash|token/i);

    for (const [method, path] of [
      ["get", "/api/v1/users"],
      ["post", "/api/v1/users"],
      ["post", `/api/v1/users/${context.seeded.adminUserId}/role`],
      ["post", `/api/v1/users/${context.seeded.adminUserId}/suspend`],
      ["post", `/api/v1/users/${context.seeded.adminUserId}/reinstate`],
      ["get", "/api/v1/audit-events"],
    ] as const) {
      const response = await member[method](path).send({});
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    }
    const me = await member.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.role).toBe("user");
  });

  it("provisions a user with a hashed credential and never persists, returns or logs the password", async () => {
    const password = "Correct-Horse-Battery-Staple-42";
    const logged: string[] = [];
    for (const method of ["info", "warn", "error", "log"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }

    const created = await admin.post("/api/v1/users").send({
      email: "New.Person@Vault.test",
      displayName: "New Person",
      password,
      role: "user",
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      email: "new.person@vault.test",
      displayName: "New Person",
      role: "user",
      status: "active",
      version: 1,
    });
    expect(JSON.stringify(created.body)).not.toContain(password);
    expect(logged.join("\n")).not.toContain(password);

    const credential = await context.database.client.query(
      "SELECT password_hash FROM user_credentials WHERE user_id = $1",
      [created.body.data.id],
    );
    expect(credential.rows[0].password_hash).toMatch(
      /^scrypt\$\d+\$\d+\$\d+\$/,
    );
    const dump = await context.database.client.query(
      "SELECT row_to_json(u)::text AS t FROM application_users u UNION ALL SELECT row_to_json(c)::text FROM user_credentials c UNION ALL SELECT row_to_json(a)::text FROM audit_events a",
    );
    expect(dump.rows.map((r) => r.t).join("\n")).not.toContain(password);

    const audit = await auditRows("user.provisioned", created.body.data.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_user_id).toBe(context.seeded.adminUserId);
    expect(audit[0].metadata).toEqual({ role: "user" });

    // The new user can sign in immediately and reach projects but not admin.
    const newUser = await context.loginAs({
      email: "new.person@vault.test",
      password,
      displayName: "New Person",
    });
    expect((await newUser.get("/api/v1/projects")).status).toBe(200);
    expect((await newUser.get("/api/v1/users")).status).toBe(403);
  });

  it("rejects duplicate emails (any case) and weak or malformed input", async () => {
    const duplicate = await admin.post("/api/v1/users").send({
      email: "MEMBER@vault.test",
      displayName: "Someone",
      password: "Another-Strong-Password-1",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("USER_EXISTS");

    const short = await admin.post("/api/v1/users").send({
      email: "short@vault.test",
      displayName: "Short",
      password: "tooShort1",
    });
    expect(short.status).toBe(400);
    expect(
      (
        await admin
          .post("/api/v1/users")
          .send({ email: "nope", displayName: "", password: "x".repeat(12) })
      ).status,
    ).toBe(400);
    const rows = await context.database.client.query(
      "SELECT count(*)::int AS count FROM application_users WHERE email IN ('short@vault.test')",
    );
    expect(rows.rows[0].count).toBe(0);
  });

  it("changes roles, suspends and reinstates with optimistic concurrency and one audit row each", async () => {
    const memberId = context.seeded.memberUserId;
    const promoted = await admin
      .post(`/api/v1/users/${memberId}/role`)
      .send({ role: "studio_admin", version: 1 });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data).toMatchObject({
      role: "studio_admin",
      version: 2,
    });

    const stale = await admin
      .post(`/api/v1/users/${memberId}/role`)
      .send({ role: "user", version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    const unchanged = await admin
      .post(`/api/v1/users/${memberId}/role`)
      .send({ role: "studio_admin", version: 2 });
    expect(unchanged.status).toBe(409);
    expect(unchanged.body.error.code).toBe("ROLE_UNCHANGED");

    const demoted = await admin
      .post(`/api/v1/users/${memberId}/role`)
      .send({ role: "user", version: 2 });
    expect(demoted.status).toBe(200);
    expect(demoted.body.data).toMatchObject({ role: "user", version: 3 });

    const suspended = await admin
      .post(`/api/v1/users/${memberId}/suspend`)
      .send({ version: 3 });
    expect(suspended.status).toBe(200);
    expect(suspended.body.data).toMatchObject({
      status: "suspended",
      version: 4,
    });
    // The member's existing session is gone.
    expect((await member.get("/api/v1/auth/me")).status).toBe(401);
    const again = await admin
      .post(`/api/v1/users/${memberId}/suspend`)
      .send({ version: 4 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("USER_ALREADY_SUSPENDED");

    const staleReinstate = await admin
      .post(`/api/v1/users/${memberId}/reinstate`)
      .send({ version: 3 });
    expect(staleReinstate.status).toBe(409);
    const reinstated = await admin
      .post(`/api/v1/users/${memberId}/reinstate`)
      .send({ version: 4 });
    expect(reinstated.status).toBe(200);
    expect(reinstated.body.data).toMatchObject({
      status: "active",
      version: 5,
    });
    member = await context.loginAs(memberCredentials);
    expect((await member.get("/api/v1/auth/me")).status).toBe(200);

    const audit = await context.database.client.query(
      "SELECT action, metadata FROM audit_events WHERE entity_id = $1 AND action LIKE 'user.%' ORDER BY created_at",
      [memberId],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      "user.provisioned",
      "user.role_changed",
      "user.role_changed",
      "user.suspended",
      "user.reinstated",
    ]);
    expect(audit.rows[1].metadata).toEqual({
      fromRole: "user",
      toRole: "studio_admin",
    });
    expect(audit.rows[3].metadata.sessionsRevoked).toBeGreaterThanOrEqual(1);
    const missing = await admin
      .post("/api/v1/users/00000000-0000-4000-8000-000000000000/suspend")
      .send({ version: 1 });
    expect(missing.status).toBe(404);
  });

  it("protects the deployment from losing its administrator", async () => {
    const adminId = context.seeded.adminUserId;
    const list = await admin.get("/api/v1/users");
    const adminRow = list.body.data.items.find(
      (u: { id: string }) => u.id === adminId,
    );
    const memberRow = list.body.data.items.find(
      (u: { email: string }) => u.email === memberCredentials.email,
    );

    const selfDemote = await admin
      .post(`/api/v1/users/${adminId}/role`)
      .send({ role: "user", version: adminRow.version });
    expect(selfDemote.status).toBe(409);
    expect(selfDemote.body.error.code).toBe("SELF_DEMOTION_BLOCKED");
    const selfSuspend = await admin
      .post(`/api/v1/users/${adminId}/suspend`)
      .send({ version: adminRow.version });
    expect(selfSuspend.status).toBe(409);
    expect(selfSuspend.body.error.code).toBe("SELF_SUSPENSION_BLOCKED");

    // Promote the member, let the member demote the original admin, then the
    // member is the last active admin and nobody can suspend or demote them.
    const promote = await admin
      .post(`/api/v1/users/${memberRow.id}/role`)
      .send({ role: "studio_admin", version: memberRow.version });
    expect(promote.status).toBe(200);
    const demoteOriginal = await member
      .post(`/api/v1/users/${adminId}/role`)
      .send({ role: "user", version: adminRow.version });
    expect(demoteOriginal.status).toBe(200);
    expect((await admin.get("/api/v1/users")).status).toBe(403);
    const lastAdmin = (await member.get("/api/v1/users")).body.data.items.find(
      (u: { email: string }) => u.email === memberCredentials.email,
    );
    const suspendedBefore = (await auditRows("user.suspended")).length;
    const selfSuspendLast = await member
      .post(`/api/v1/users/${lastAdmin.id}/suspend`)
      .send({ version: lastAdmin.version });
    expect(selfSuspendLast.status).toBe(409);
    expect((await auditRows("user.suspended")).length).toBe(suspendedBefore);

    // Restore the original state for later tests.
    const restore = await member
      .post(`/api/v1/users/${adminId}/role`)
      .send({ role: "studio_admin", version: adminRow.version + 1 });
    expect(restore.status).toBe(200);
    const demoteLast = await admin
      .post(`/api/v1/users/${lastAdmin.id}/role`)
      .send({ role: "user", version: lastAdmin.version });
    expect(demoteLast.status).toBe(200);
  });

  it("pages audit events newest first with a stable cursor", async () => {
    const first = await admin.get("/api/v1/audit-events?limit=3");
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(3);
    expect(first.body.data.nextCursor).toBe(first.body.data.items[2].id);
    expect(first.body.data.items[0].actor).toMatchObject({
      email: expect.any(String),
    });
    expect(JSON.stringify(first.body)).not.toMatch(/password|token_hash/i);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await admin.get(
        `/api/v1/audit-events?limit=3${cursor ? `&cursor=${cursor}` : ""}`,
      );
      expect(page.status).toBe(200);
      seen.push(...page.body.data.items.map((e: { id: string }) => e.id));
      cursor = page.body.data.nextCursor;
      pages += 1;
    } while (cursor && pages < 100);
    const total = await context.database.client.query(
      "SELECT count(*)::int AS count FROM audit_events",
    );
    expect(new Set(seen).size).toBe(total.rows[0].count);
    const timestamps = (
      await admin.get("/api/v1/audit-events?limit=100")
    ).body.data.items.map((e: { createdAt: string }) => e.createdAt);
    expect([...timestamps].sort().reverse()).toEqual(timestamps);

    const filtered = await admin.get(
      `/api/v1/audit-events?entityType=application_user&entityId=${context.seeded.memberUserId}`,
    );
    expect(
      filtered.body.data.items.every(
        (e: { entityId: string }) => e.entityId === context.seeded.memberUserId,
      ),
    ).toBe(true);
    expect((await admin.get("/api/v1/audit-events?cursor=nope")).status).toBe(
      400,
    );
  });
});

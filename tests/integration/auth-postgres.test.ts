import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createVaultServer } from "../../server/app";
import {
  adminCredentials,
  createTestContext,
  memberCredentials,
  testEnvironment,
  type TestContext,
} from "../support/test-context";

let context: TestContext;

const cookieOf = (response: request.Response): string => {
  const header = response.headers["set-cookie"];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  return cookies.find((c) => c.startsWith("vault_session=")) ?? "";
};

beforeAll(async () => {
  context = await createTestContext();
});

afterAll(async () => {
  await context.destroy();
});

describe("first-party authentication against an isolated PostgreSQL database", () => {
  it("logs in with email and password, sets a hardened cookie and returns the safe user", async () => {
    const response = await request(context.app)
      .post("/api/v1/auth/login")
      .send({
        email: "  ADMIN@Vault.test ",
        password: adminCredentials.password,
      });
    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({
      id: context.seeded.adminUserId,
      email: "admin@vault.test",
      displayName: "Test Admin",
      role: "studio_admin",
      status: "active",
    });
    const cookie = cookieOf(response);
    expect(cookie).toMatch(/^vault_session=[A-Za-z0-9_-]{40,}; /);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toMatch(/Max-Age=\d+/);
    expect(cookie).not.toContain("Secure");
    expect(JSON.stringify(response.body)).not.toContain(
      adminCredentials.password,
    );

    // The database holds only a hash of the token, never the token.
    const token = cookie.split(";")[0].slice("vault_session=".length);
    const sessions = await context.database.client.query(
      "SELECT token_hash FROM auth_sessions",
    );
    expect(sessions.rows.some((r) => r.token_hash === token)).toBe(false);
    expect(sessions.rows.every((r) => r.token_hash.length > 20)).toBe(true);

    const me = await request(context.app)
      .get("/api/v1/auth/me")
      .set("cookie", cookie.split(";")[0]);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe("admin@vault.test");
    const audit = await context.database.client.query(
      "SELECT count(*)::int AS c FROM audit_events WHERE action = 'auth.login' AND actor_user_id = $1",
      [context.seeded.adminUserId],
    );
    expect(audit.rows[0].c).toBeGreaterThanOrEqual(1);
  });

  it("refuses wrong passwords and unknown emails identically, and malformed input with 400", async () => {
    const wrong = await request(context.app)
      .post("/api/v1/auth/login")
      .send({ email: adminCredentials.email, password: "definitely-not-it" });
    const unknown = await request(context.app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@vault.test", password: "definitely-not-it" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Incorrect email or password.",
    });
    expect(unknown.body.error.code).toBe(wrong.body.error.code);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(cookieOf(wrong)).toBe("");
    expect(cookieOf(unknown)).toBe("");

    for (const body of [
      {},
      { email: "not-an-email", password: "x" },
      { email: adminCredentials.email },
      { password: "x" },
    ]) {
      const malformed = await request(context.app)
        .post("/api/v1/auth/login")
        .send(body);
      expect(malformed.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("refuses unauthenticated, expired, revoked and forged sessions", async () => {
    expect((await request(context.app).get("/api/v1/auth/me")).status).toBe(
      401,
    );
    const forged = await request(context.app)
      .get("/api/v1/projects")
      .set("cookie", "vault_session=" + "a".repeat(43));
    expect(forged.status).toBe(401);
    expect(cookieOf(forged)).toMatch(/Max-Age=0/);

    const agent = await context.loginAs(memberCredentials);
    expect((await agent.get("/api/v1/projects")).status).toBe(200);
    await context.database.client.query(
      "UPDATE auth_sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1",
      [context.seeded.memberUserId],
    );
    expect((await agent.get("/api/v1/projects")).status).toBe(401);

    const idle = await context.loginAs(memberCredentials);
    await context.database.client.query(
      "UPDATE auth_sessions SET last_seen_at = now() - interval '25 hours' WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()",
      [context.seeded.memberUserId],
    );
    expect((await idle.get("/api/v1/projects")).status).toBe(401);

    const revoked = await context.loginAs(memberCredentials);
    await context.database.client.query(
      "UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [context.seeded.memberUserId],
    );
    expect((await revoked.get("/api/v1/projects")).status).toBe(401);
  });

  it("logs out by revoking the session and clearing the cookie", async () => {
    const agent = await context.loginAs(memberCredentials);
    const logout = await agent.post("/api/v1/auth/logout");
    expect(logout.status).toBe(204);
    expect(cookieOf(logout)).toMatch(/Max-Age=0/);
    expect((await agent.get("/api/v1/auth/me")).status).toBe(401);
    const audit = await context.database.client.query(
      "SELECT count(*)::int AS c FROM audit_events WHERE action = 'auth.logout' AND actor_user_id = $1",
      [context.seeded.memberUserId],
    );
    expect(audit.rows[0].c).toBeGreaterThanOrEqual(1);
    // Logging out again, or without a cookie, is harmless.
    expect((await agent.post("/api/v1/auth/logout")).status).toBe(204);
    expect(
      (await request(context.app).post("/api/v1/auth/logout")).status,
    ).toBe(204);
  });

  it("rotates the session on login and revokes the previous one", async () => {
    const first = await context.loginAs(memberCredentials);
    const firstCookie = cookieOf(
      await request(context.app)
        .post("/api/v1/auth/login")
        .send(memberCredentials),
    ).split(";")[0];
    const second = await request(context.app)
      .post("/api/v1/auth/login")
      .set("cookie", firstCookie)
      .send(memberCredentials);
    expect(second.status).toBe(200);
    const replaced = await request(context.app)
      .get("/api/v1/auth/me")
      .set("cookie", firstCookie);
    expect(replaced.status).toBe(401);
    expect((await first.get("/api/v1/auth/me")).status).toBe(200);
  });

  it("suspension revokes live sessions and blocks new logins until reinstated", async () => {
    const admin = await context.loginAs(adminCredentials);
    const member = await context.loginAs(memberCredentials);
    expect((await member.get("/api/v1/projects")).status).toBe(200);

    const users = (await admin.get("/api/v1/users")).body.data.items;
    const row = users.find(
      (u: { email: string }) => u.email === memberCredentials.email,
    );
    const suspended = await admin
      .post(`/api/v1/users/${row.id}/suspend`)
      .send({ version: row.version });
    expect(suspended.status).toBe(200);
    const audit = await context.database.client.query(
      "SELECT metadata FROM audit_events WHERE action = 'user.suspended' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1",
      [row.id],
    );
    expect(audit.rows[0].metadata.sessionsRevoked).toBeGreaterThanOrEqual(1);

    const refused = await member.get("/api/v1/projects");
    expect(refused.status).toBe(401);
    const loginRefused = await request(context.app)
      .post("/api/v1/auth/login")
      .send(memberCredentials);
    expect(loginRefused.status).toBe(403);
    expect(loginRefused.body.error.code).toBe("ACCOUNT_SUSPENDED");
    expect(cookieOf(loginRefused)).toBe("");

    const reinstated = await admin
      .post(`/api/v1/users/${row.id}/reinstate`)
      .send({ version: row.version + 1 });
    expect(reinstated.status).toBe(200);
    expect(
      (await context.loginAs(memberCredentials))
        .get("/api/v1/projects")
        .then((r) => r.status),
    ).resolves.toBe(200);
  });

  it("rate limits repeated login attempts per client", async () => {
    const app = await context.newApp();
    let limited: request.Response | undefined;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request(app).post("/api/v1/auth/login").send({
        email: adminCredentials.email,
        password: "wrong-password-value",
      });
      if (response.status === 429) {
        limited = response;
        break;
      }
      expect(response.status).toBe(401);
    }
    expect(limited?.status).toBe(429);
    expect(limited?.body.error.code).toBe("RATE_LIMITED");
  });

  it("applies production cookie and origin policy", async () => {
    const productionEnv = testEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: context.env.DATABASE_URL,
      REPLIT_DOMAINS: "vault.example.com",
    });
    const { app } = await createVaultServer({
      env: productionEnv,
      db: context.db,
      frontend: "none",
    });
    const host = "vault.example.com";

    const noOrigin = await request(app)
      .post("/api/v1/auth/login")
      .set("host", host)
      .send(adminCredentials);
    expect(noOrigin.status).toBe(403);
    expect(noOrigin.body.error.code).toBe("INVALID_ORIGIN");
    const crossSite = await request(app)
      .post("/api/v1/auth/login")
      .set("host", host)
      .set("origin", "https://evil.example.net")
      .send(adminCredentials);
    expect(crossSite.status).toBe(403);
    const plainHttp = await request(app)
      .post("/api/v1/auth/login")
      .set("host", host)
      .set("origin", "http://vault.example.com")
      .send(adminCredentials);
    expect(plainHttp.status).toBe(403);
    const fetchSite = await request(app)
      .post("/api/v1/auth/login")
      .set("host", host)
      .set("origin", "https://vault.example.com")
      .set("sec-fetch-site", "cross-site")
      .send(adminCredentials);
    expect(fetchSite.status).toBe(403);

    const ok = await request(app)
      .post("/api/v1/auth/login")
      .set("host", host)
      .set("origin", "https://vault.example.com")
      .send(adminCredentials);
    expect(ok.status).toBe(200);
    const cookie = cookieOf(ok);
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    // Reads need no Origin; mutations with a session still need one.
    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("host", host)
      .set("cookie", cookie.split(";")[0]);
    expect(me.status).toBe(200);
    const csrf = await request(app)
      .post("/api/v1/projects")
      .set("host", host)
      .set("cookie", cookie.split(";")[0])
      .send({ title: "Forged" });
    expect(csrf.status).toBe(403);
    expect(csrf.body.error.code).toBe("INVALID_ORIGIN");
  });

  it("refuses a wrong origin even in development, where a missing origin is tolerated", async () => {
    const agent = await context.loginAs(adminCredentials);
    const wrongOrigin = await agent
      .post("/api/v1/projects")
      .set("origin", "http://evil.example.net")
      .send({ title: "Forged" });
    expect(wrongOrigin.status).toBe(403);
    const sameOrigin = await agent
      .post("/api/v1/projects")
      .set("origin", "http://127.0.0.1:5001")
      .send({ title: "Legit" });
    expect(sameOrigin.status).toBe(201);
  });
});

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VerifiedIdentity } from "../../server/modules/auth/auth-service";
import {
  bootstrapIdentity,
  createTestContext,
  type TestContext,
} from "../support/test-context";

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext({
    bootstrapAdminClerkId: bootstrapIdentity.clerkUserId,
  });
});

afterAll(async () => {
  await context.destroy();
});

describe("local access control against an isolated PostgreSQL database", () => {
  it("bootstraps the configured Clerk ID exactly once, with profile data and an audit row", async () => {
    const app = await context.appFor(bootstrapIdentity);
    const first = await request(app).get("/api/v1/auth/me");
    expect(first.status).toBe(200);
    expect(first.body.data.user).toMatchObject({
      clerkUserId: bootstrapIdentity.clerkUserId,
      email: bootstrapIdentity.email,
      displayName: bootstrapIdentity.displayName,
      role: "studio_admin",
      status: "active",
    });

    // Repeated requests, and a second process with the same configuration,
    // never create a second account or a second audit event.
    const again = await request(app).get("/api/v1/auth/me");
    expect(again.body.data.user.id).toBe(first.body.data.user.id);
    const otherProcess = await context.appFor(bootstrapIdentity);
    const third = await request(otherProcess).get("/api/v1/auth/me");
    expect(third.body.data.user.id).toBe(first.body.data.user.id);

    const users = await context.database.client.query(
      "SELECT count(*)::int AS count FROM application_users WHERE clerk_user_id = $1",
      [bootstrapIdentity.clerkUserId],
    );
    expect(users.rows[0].count).toBe(1);
    const audit = await context.database.client.query(
      "SELECT actor_user_id, entity_id, metadata FROM audit_events WHERE action = 'user.bootstrap_admin_created'",
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_user_id).toBe(first.body.data.user.id);
    expect(audit.rows[0].entity_id).toBe(first.body.data.user.id);
    expect(audit.rows[0].metadata).toMatchObject({ role: "studio_admin" });
  });

  it("uses the Clerk profile lookup when the identity carries no profile", async () => {
    const lookups: string[] = [];
    const profileContext = await createTestContext({
      bootstrapAdminClerkId: "user_profile_lookup",
    });
    try {
      const app = await profileContext.appFor(
        { clerkUserId: "user_profile_lookup", email: null, displayName: null },
        {
          profileLookup: async (clerkUserId) => {
            lookups.push(clerkUserId);
            return { email: "looked-up@vault.test", displayName: "Looked Up" };
          },
        },
      );
      const me = await request(app).get("/api/v1/auth/me");
      expect(me.status).toBe(200);
      expect(me.body.data.user.email).toBe("looked-up@vault.test");
      expect(me.body.data.user.displayName).toBe("Looked Up");
      await request(app).get("/api/v1/auth/me");
      expect(lookups).toEqual(["user_profile_lookup"]);
    } finally {
      await profileContext.destroy();
    }
  });

  it("refuses a verified Clerk user without a local account and returns their Clerk ID", async () => {
    const stranger: VerifiedIdentity = {
      clerkUserId: "user_stranger",
      email: "stranger@vault.test",
      displayName: "Stranger",
    };
    const app = await context.appFor(stranger);
    const me = await request(app).get("/api/v1/auth/me");
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe("LOCAL_ACCESS_REQUIRED");
    expect(me.body.error.details).toEqual({ clerkUserId: "user_stranger" });
    const projects = await request(app).get("/api/v1/projects");
    expect(projects.status).toBe(403);
    const users = await context.database.client.query(
      "SELECT count(*)::int AS count FROM application_users WHERE clerk_user_id = $1",
      ["user_stranger"],
    );
    expect(users.rows[0].count).toBe(0);
  });

  it("enforces account status and studio-admin authorization", async () => {
    await context.database.client.query(
      "INSERT INTO application_users (clerk_user_id, email, role, status) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)",
      [
        "user_member",
        "member@vault.test",
        "user",
        "active",
        "user_suspended",
        "suspended@vault.test",
        "user",
        "suspended",
      ],
    );
    const memberApp = await context.appFor({
      clerkUserId: "user_member",
      email: "member@vault.test",
      displayName: "Member",
    });
    const canRead = await request(memberApp).get("/api/v1/projects");
    expect(canRead.status).toBe(200);
    const denied = await request(memberApp)
      .post("/api/v1/projects")
      .send({ title: "Forbidden" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");

    const suspendedApp = await context.appFor({
      clerkUserId: "user_suspended",
      email: "suspended@vault.test",
      displayName: "Suspended",
    });
    const suspended = await request(suspendedApp).get("/api/v1/auth/me");
    expect(suspended.status).toBe(403);
    expect(suspended.body.error.code).toBe("ACCOUNT_SUSPENDED");
  });
});

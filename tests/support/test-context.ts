import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { createVaultServer } from "../../server/app";
import { readEnvironment, type Environment } from "../../server/config/env";
import { createDatabase, type Database } from "../../server/db/client";
import { bootstrapStudioAdmin } from "../../server/modules/users/bootstrap-admin";
import { createUserService } from "../../server/modules/users/user-service";
import {
  createIsolatedPostgresDatabase,
  type IsolatedPostgresDatabase,
} from "./isolated-postgres";
import { createTestStorage, type TestStorage } from "./test-storage";

export interface TestCredentials {
  email: string;
  password: string;
  displayName: string;
}

/** The seeded studio_admin every test context starts with. */
export const adminCredentials: TestCredentials = {
  email: "admin@vault.test",
  password: "Admin-Password-2026-strong",
  displayName: "Test Admin",
};

/** An ordinary active user, also seeded. */
export const memberCredentials: TestCredentials = {
  email: "member@vault.test",
  password: "Member-Password-2026-strong",
  displayName: "Test Member",
};

export interface TestContext {
  env: Environment;
  db: Database;
  database: IsolatedPostgresDatabase;
  /** Isolated temporary file storage, removed on destroy. */
  storage: TestStorage;
  /** One API-only app shared by the suite. */
  app: Express;
  /** Vault ids of the seeded users. */
  seeded: { adminUserId: string; memberUserId: string };
  /** A fresh app instance (own rate-limit counters) on the same database. */
  newApp(): Promise<Express>;
  /** Logs in through the real endpoint; the agent keeps the session cookie. */
  loginAs(
    credentials: TestCredentials,
    app?: Express,
  ): Promise<ReturnType<typeof request.agent>>;
  destroy(): Promise<void>;
}

export function testEnvironment(
  overrides: Partial<Record<string, string | undefined>> = {},
): Environment {
  return readEnvironment({
    ...process.env,
    NODE_ENV: "test",
    REPLIT_DEV_DOMAIN: undefined,
    ...overrides,
  });
}

/**
 * Seeds the two accounts every suite needs through the real use-cases:
 * bootstrap for the studio_admin, provisioning for the ordinary user.
 */
export async function seedAccessFixtures(
  db: Database,
): Promise<{ adminUserId: string; memberUserId: string }> {
  const admin = await bootstrapStudioAdmin(
    { db },
    { ...adminCredentials, requestId: randomUUID() },
  );
  const member = await createUserService({ db }).provision(
    { ...memberCredentials, role: "user" },
    { userId: admin.userId, requestId: randomUUID() },
  );
  return { adminUserId: admin.userId, memberUserId: member.id };
}

/**
 * One disposable PostgreSQL database plus an explicit environment. Tests
 * never mutate `process.env`: the app is built from these values directly.
 */
export async function createTestContext(): Promise<TestContext> {
  const database = await createIsolatedPostgresDatabase();
  const env = testEnvironment({ DATABASE_URL: database.databaseUrl });
  const handle = createDatabase({
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV,
  });
  const seeded = await seedAccessFixtures(handle.db);
  const storage = await createTestStorage();
  const newApp = async () =>
    (
      await createVaultServer({
        env,
        db: handle.db,
        storage: storage.storage,
        frontend: "none",
      })
    ).app;
  const app = await newApp();
  return {
    env,
    db: handle.db,
    database,
    storage,
    app,
    seeded,
    newApp,
    async loginAs(credentials, target = app) {
      const agent = request.agent(target);
      const response = await agent
        .post("/api/v1/auth/login")
        .send({ email: credentials.email, password: credentials.password });
      if (response.status !== 200) {
        throw new Error(
          `Login as ${credentials.email} failed: ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return agent;
    },
    async destroy() {
      await handle.close();
      await database.destroy();
      await storage.destroy();
    },
  };
}

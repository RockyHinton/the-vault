import type { Express } from "express";
import { createVaultServer } from "../../server/app";
import { readEnvironment, type Environment } from "../../server/config/env";
import { createDatabase, type Database } from "../../server/db/client";
import type { VerifiedIdentity } from "../../server/modules/auth/auth-service";
import type { ProfileLookup } from "../../server/modules/auth/clerk-profile";
import {
  createIsolatedPostgresDatabase,
  type IsolatedPostgresDatabase,
} from "./isolated-postgres";

/**
 * Syntactically valid Clerk development keys that belong to no instance.
 * API tests never talk to Clerk: identity comes through the test seam, and an
 * unauthenticated request is rejected before any Clerk network call.
 */
export const dummyClerkKeys = {
  CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("example.clerk.accounts.test$").toString("base64")}`,
  CLERK_SECRET_KEY: "sk_test_not_a_real_key",
};

export const bootstrapIdentity: VerifiedIdentity = {
  clerkUserId: "user_bootstrap",
  email: "admin@vault.test",
  displayName: "Test Admin",
};

export interface TestContext {
  env: Environment;
  db: Database;
  database: IsolatedPostgresDatabase;
  /** Builds an API-only app whose every request carries `identity` (or none). */
  appFor(
    identity?: VerifiedIdentity,
    options?: { profileLookup?: ProfileLookup },
  ): Promise<Express>;
  destroy(): Promise<void>;
}

export function testEnvironment(
  overrides: Partial<Record<string, string | undefined>> = {},
): Environment {
  return readEnvironment({
    ...process.env,
    ...dummyClerkKeys,
    NODE_ENV: "test",
    REPLIT_DEV_DOMAIN: undefined,
    VAULT_BOOTSTRAP_ADMIN_CLERK_ID: undefined,
    ...overrides,
  });
}

/**
 * One disposable PostgreSQL database plus an explicit environment. Tests
 * never mutate `process.env`: the app is built from these values directly.
 */
export async function createTestContext(
  options: {
    bootstrapAdminClerkId?: string;
  } = {},
): Promise<TestContext> {
  const database = await createIsolatedPostgresDatabase();
  const env = testEnvironment({
    DATABASE_URL: database.databaseUrl,
    VAULT_BOOTSTRAP_ADMIN_CLERK_ID: options.bootstrapAdminClerkId,
  });
  const handle = createDatabase({
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV,
  });
  return {
    env,
    db: handle.db,
    database,
    async appFor(identity, appOptions = {}) {
      const { app } = await createVaultServer({
        env,
        db: handle.db,
        frontend: "none",
        verifiedIdentity: identity,
        profileLookup: appOptions.profileLookup,
      });
      return app;
    },
    async destroy() {
      await handle.close();
      await database.destroy();
    },
  };
}

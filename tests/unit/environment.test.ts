import { describe, expect, it } from "vitest";
import { readEnvironment } from "../../server/config/env";

const base = {
  DATABASE_URL: "postgres://vault:password@localhost:5432/vault_test",
  CLERK_PUBLISHABLE_KEY: "pk_test_example",
  CLERK_SECRET_KEY: "sk_test_example",
};

describe("environment validation", () => {
  it("rejects a server without a database URL", () => {
    expect(() => readEnvironment({ ...base, DATABASE_URL: undefined })).toThrow("DATABASE_URL");
  });

  it("requires a public domain in production", () => {
    expect(() => readEnvironment({ ...base, NODE_ENV: "production" })).toThrow("REPLIT_DOMAINS");
  });

  it("allows a development configuration", () => {
    expect(readEnvironment(base).NODE_ENV).toBe("development");
  });
});
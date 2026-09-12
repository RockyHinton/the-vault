import { describe, expect, it } from "vitest";
import { allowedHosts, readEnvironment } from "../../server/config/env";

const base = {
  DATABASE_URL: "postgres://vault:password@localhost:5432/vault_test",
  CLERK_PUBLISHABLE_KEY: "pk_test_example",
  CLERK_SECRET_KEY: "sk_test_example",
};

const production = {
  ...base,
  NODE_ENV: "production",
  REPLIT_DOMAINS: "vault.example.com",
  CLERK_PUBLISHABLE_KEY: "pk_live_example",
  CLERK_SECRET_KEY: "sk_live_example",
};

describe("environment validation", () => {
  it("rejects a server without a database URL", () => {
    expect(() => readEnvironment({ ...base, DATABASE_URL: undefined })).toThrow(
      "DATABASE_URL",
    );
  });

  it("allows a development configuration", () => {
    expect(readEnvironment(base).NODE_ENV).toBe("development");
  });

  it("falls back to the Vite publishable key so .env.local needs no duplicate", () => {
    const env = readEnvironment({
      ...base,
      CLERK_PUBLISHABLE_KEY: undefined,
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_from_vite",
    });
    expect(env.CLERK_PUBLISHABLE_KEY).toBe("pk_test_from_vite");
    expect(
      readEnvironment({
        ...base,
        VITE_CLERK_PUBLISHABLE_KEY: "pk_test_ignored",
      }).CLERK_PUBLISHABLE_KEY,
    ).toBe("pk_test_example");
  });

  it("requires a public domain in production", () => {
    expect(() =>
      readEnvironment({ ...production, REPLIT_DOMAINS: undefined }),
    ).toThrow("REPLIT_DOMAINS");
  });

  it("rejects Clerk test keys in production, including via the Vite fallback", () => {
    expect(() =>
      readEnvironment({ ...production, CLERK_PUBLISHABLE_KEY: "pk_test_x" }),
    ).toThrow("live Clerk keys");
    expect(() =>
      readEnvironment({ ...production, CLERK_SECRET_KEY: "sk_test_x" }),
    ).toThrow("live Clerk keys");
    expect(() =>
      readEnvironment({
        ...production,
        CLERK_PUBLISHABLE_KEY: undefined,
        VITE_CLERK_PUBLISHABLE_KEY: "pk_test_x",
      }),
    ).toThrow("live Clerk keys");
    expect(readEnvironment(production).NODE_ENV).toBe("production");
  });

  it("derives allowed hosts strictly in production and with loopback elsewhere", () => {
    expect(
      allowedHosts(
        readEnvironment({
          ...production,
          REPLIT_DOMAINS: "a.example.com, b.example.com",
        }),
      ),
    ).toEqual(["a.example.com", "b.example.com"]);
    expect(allowedHosts(readEnvironment(base))).toEqual([
      "localhost",
      "127.0.0.1",
    ]);
  });
});

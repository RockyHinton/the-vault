import { describe, expect, it } from "vitest";
import { allowedHosts, readEnvironment } from "../../server/config/env";

const base = {
  DATABASE_URL: "postgres://vault:password@localhost:5432/vault_test",
};

const production = {
  ...base,
  NODE_ENV: "production",
  REPLIT_DOMAINS: "vault.example.com",
};

describe("environment validation", () => {
  it("rejects a server without a database URL", () => {
    expect(() => readEnvironment({ ...base, DATABASE_URL: undefined })).toThrow(
      "DATABASE_URL",
    );
  });

  it("allows a development configuration with no other variables", () => {
    const env = readEnvironment(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(5000);
  });

  it("requires a public domain in production and validates its shape", () => {
    expect(() =>
      readEnvironment({ ...production, REPLIT_DOMAINS: undefined }),
    ).toThrow("REPLIT_DOMAINS");
    expect(() =>
      readEnvironment({ ...production, REPLIT_DOMAINS: "https://bad.example" }),
    ).toThrow("bare HTTPS hostnames");
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

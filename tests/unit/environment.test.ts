import { describe, expect, it } from "vitest";
import { allowedHosts, readEnvironment } from "../../server/config/env";

const base = {
  DATABASE_URL: "postgres://vault:password@localhost:5432/vault_test",
};

const production = {
  ...base,
  NODE_ENV: "production",
  REPLIT_DOMAINS: "vault.example.com",
  VAULT_STORAGE_PROVIDER: "local",
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

  it("requires allowed hosts in production and validates their shape", () => {
    expect(() =>
      readEnvironment({ ...production, REPLIT_DOMAINS: undefined }),
    ).toThrow("VAULT_ALLOWED_HOSTS (or REPLIT_DOMAINS on Replit)");
    expect(() =>
      readEnvironment({ ...production, REPLIT_DOMAINS: "https://bad.example" }),
    ).toThrow("bare HTTPS hostnames");
    expect(() =>
      readEnvironment({
        ...production,
        REPLIT_DOMAINS: undefined,
        VAULT_ALLOWED_HOSTS: "https://bad.example",
      }),
    ).toThrow("VAULT_ALLOWED_HOSTS must contain bare hostnames");
    expect(() =>
      readEnvironment({ ...base, VAULT_ALLOWED_HOSTS: "bad.example/path" }),
    ).toThrow("VAULT_ALLOWED_HOSTS must contain bare hostnames");
    expect(readEnvironment(production).NODE_ENV).toBe("production");
    expect(
      readEnvironment({
        ...production,
        REPLIT_DOMAINS: undefined,
        VAULT_ALLOWED_HOSTS: "vault.studio.example",
      }).NODE_ENV,
    ).toBe("production");
  });

  it("requires an explicit storage provider in production and defaults it elsewhere", () => {
    expect(() =>
      readEnvironment({ ...production, VAULT_STORAGE_PROVIDER: undefined }),
    ).toThrow("VAULT_STORAGE_PROVIDER");
    expect(readEnvironment(base).VAULT_STORAGE_PROVIDER).toBe("local");
    expect(readEnvironment(base).VAULT_MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
    expect(() =>
      readEnvironment({ ...base, VAULT_MAX_UPLOAD_BYTES: "10" }),
    ).toThrow("VAULT_MAX_UPLOAD_BYTES");
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

  it("VAULT_ALLOWED_HOSTS is the provider-neutral host list and wins over Replit's", () => {
    // Production: exactly the explicit list, Replit's list ignored, no loopback.
    expect(
      allowedHosts(
        readEnvironment({
          ...production,
          VAULT_ALLOWED_HOSTS: "vault.studio.example , files.studio.example",
          REPLIT_DOMAINS: "vault.replit.app",
        }),
      ),
    ).toEqual(["vault.studio.example", "files.studio.example"]);
    // Development: configured hosts and the Replit workspace host join loopback.
    expect(
      allowedHosts(
        readEnvironment({
          ...base,
          VAULT_ALLOWED_HOSTS: "dev.studio.example",
          REPLIT_DEV_DOMAIN: "workspace.replit.dev",
        }),
      ),
    ).toEqual([
      "dev.studio.example",
      "workspace.replit.dev",
      "localhost",
      "127.0.0.1",
    ]);
  });
});

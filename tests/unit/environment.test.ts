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

  it("requires a bucket for a non-local storage provider, in every environment", () => {
    // Without this, two deployments configured the same way would share one
    // object store, and a development sweep would delete production bytes.
    expect(() =>
      readEnvironment({ ...base, VAULT_STORAGE_PROVIDER: "replit" }),
    ).toThrow("VAULT_STORAGE_BUCKET is required");
    expect(() =>
      readEnvironment({ ...production, VAULT_STORAGE_PROVIDER: "replit" }),
    ).toThrow("VAULT_STORAGE_BUCKET is required");
    expect(
      readEnvironment({
        ...production,
        VAULT_STORAGE_PROVIDER: "replit",
        VAULT_STORAGE_BUCKET: "vault-production",
      }).VAULT_STORAGE_BUCKET,
    ).toBe("vault-production");
    // The local provider is unchanged and needs no bucket.
    expect(readEnvironment(base).VAULT_STORAGE_BUCKET).toBeUndefined();
  });

  it("validates the optional storage prefix", () => {
    const replit = {
      ...base,
      VAULT_STORAGE_PROVIDER: "replit",
      VAULT_STORAGE_BUCKET: "vault-development",
    };
    expect(readEnvironment(replit).VAULT_STORAGE_PREFIX).toBeUndefined();
    expect(
      readEnvironment({ ...replit, VAULT_STORAGE_PREFIX: "dev" })
        .VAULT_STORAGE_PREFIX,
    ).toBe("dev");
    for (const prefix of ["/dev", "dev//x", "../dev", "dev\\x", "dev x"]) {
      expect(() =>
        readEnvironment({ ...replit, VAULT_STORAGE_PREFIX: prefix }),
      ).toThrow("VAULT_STORAGE_PREFIX");
    }
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

  it("accepts either Replit host variable outside production", () => {
    // A workspace may expose its preview host as REPLIT_DEV_DOMAIN, as
    // REPLIT_DOMAINS, or both; refusing one of them would answer
    // UNTRUSTED_HOST to every request in the development workspace.
    expect(
      allowedHosts(
        readEnvironment({ ...base, REPLIT_DOMAINS: "workspace.replit.dev" }),
      ),
    ).toEqual(["workspace.replit.dev", "localhost", "127.0.0.1"]);
    expect(
      allowedHosts(
        readEnvironment({
          ...base,
          REPLIT_DEV_DOMAIN: "preview.replit.dev",
          REPLIT_DOMAINS: "a.replit.dev, b.replit.dev",
        }),
      ),
    ).toEqual([
      "preview.replit.dev",
      "a.replit.dev",
      "b.replit.dev",
      "localhost",
      "127.0.0.1",
    ]);
    // Production is still exactly the configured list: no loopback, and the
    // workspace variable is ignored.
    expect(
      allowedHosts(
        readEnvironment({
          ...production,
          VAULT_ALLOWED_HOSTS: "vault.studio.example",
          REPLIT_DEV_DOMAIN: "workspace.replit.dev",
        }),
      ),
    ).toEqual(["vault.studio.example"]);
  });
});

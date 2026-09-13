import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createVaultServer } from "../../server/app";
import { createDatabase, type DatabaseHandle } from "../../server/db/client";
import { testEnvironment } from "../support/test-context";

// These paths are rejected before any query runs, so the pool never connects.
const unusedDatabaseUrl = "postgres://u:p@localhost:5432/vault_test_unused";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let handle: DatabaseHandle;
let app: Express;

beforeAll(async () => {
  handle = createDatabase({ databaseUrl: unusedDatabaseUrl, nodeEnv: "test" });
  ({ app } = await createVaultServer({
    env: testEnvironment({ DATABASE_URL: unusedDatabaseUrl }),
    db: handle.db,
    frontend: "none",
  }));
});

afterAll(async () => {
  await handle.close();
});

describe("HTTP boundary", () => {
  it("does not expose projects without a session cookie", async () => {
    const response = await request(app).get("/api/v1/projects");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(response.headers["x-request-id"]).toMatch(uuid);
  });

  it("maps malformed JSON to a stable 400", async () => {
    const response = await request(app)
      .post("/api/v1/projects")
      .set("content-type", "application/json")
      .send("{not json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(response.body.error.requestId).toMatch(uuid);
  });

  it("maps an oversized body to 413", async () => {
    const response = await request(app)
      .post("/api/v1/projects")
      .set("content-type", "application/json")
      .send(JSON.stringify({ title: "x".repeat(2_000_000) }));
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects untrusted hosts with a real request ID", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .set("host", "evil.example.com");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UNTRUSTED_HOST");
    expect(response.body.error.requestId).toMatch(uuid);
    expect(response.body.error.requestId).not.toMatch(/^0{8}-/);
    expect(response.headers["x-request-id"]).toBe(
      response.body.error.requestId,
    );
  });

  it("echoes a valid client request ID and replaces an invalid one", async () => {
    const supplied = "11111111-1111-4111-8111-111111111111";
    const echoed = await request(app)
      .get("/api/v1/health")
      .set("x-request-id", supplied);
    expect(echoed.body.requestId).toBe(supplied);
    const replaced = await request(app)
      .get("/api/v1/health")
      .set("x-request-id", "not-a-uuid");
    expect(replaced.body.requestId).toMatch(uuid);
    expect(replaced.body.requestId).not.toBe("not-a-uuid");
  });

  it("returns the stable envelope for unknown API routes", async () => {
    const response = await request(app).get("/api/v1/nope");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        requestId: expect.stringMatching(uuid),
      },
    });
  });
});

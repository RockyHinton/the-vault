import { describe, expect, it } from "vitest";
import request from "supertest";
import { createServer } from "node:http";
import { createApp } from "../../server/index";
import { registerRoutes } from "../../server/routes";
import { errorHandler } from "../../server/http/errors";

describe("API authentication boundary", () => {
  it("does not expose projects without a verified Clerk session", async () => {
    const app = createApp();
    await registerRoutes(createServer(app), app);
    app.use(errorHandler);

    const response = await request(app).get("/api/v1/projects");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
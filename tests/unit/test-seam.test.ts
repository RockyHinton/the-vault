import { describe, expect, it } from "vitest";
import { createVaultServer } from "../../server/app";
import { createDatabase } from "../../server/db/client";
import { bootstrapIdentity, testEnvironment } from "../support/test-context";

// The pool connects lazily, so this handle never touches a server.
const unusedDatabaseUrl = "postgres://u:p@localhost:5432/vault_test_unused";

describe("test identity seam", () => {
  it("is refused outside NODE_ENV=test", async () => {
    const handle = createDatabase({
      databaseUrl: unusedDatabaseUrl,
      nodeEnv: "development",
    });
    try {
      await expect(
        createVaultServer({
          env: testEnvironment({
            NODE_ENV: "development",
            DATABASE_URL: unusedDatabaseUrl,
          }),
          db: handle.db,
          frontend: "none",
          verifiedIdentity: bootstrapIdentity,
        }),
      ).rejects.toThrow("only available when NODE_ENV=test");
    } finally {
      await handle.close();
    }
  });
});

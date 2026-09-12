import { describe, expect, it } from "vitest";
import { createDatabase } from "../../server/db/client";
import { assertTestDatabaseUrl } from "../../server/db/test-safety";

describe("test database safety", () => {
  it("accepts only disposable vault_test_* database names under NODE_ENV=test", () => {
    expect(() =>
      assertTestDatabaseUrl("postgres://u:p@localhost:5432/vault_test_abc123"),
    ).not.toThrow();
    for (const name of ["vault_dev", "vault", "vault_test", "production"]) {
      expect(() =>
        assertTestDatabaseUrl(`postgres://u:p@localhost:5432/${name}`),
      ).toThrow("vault_test_*");
    }
  });

  it("refuses to bind the application pool to a non-test database when NODE_ENV=test", () => {
    expect(() =>
      createDatabase({
        databaseUrl: "postgres://u:p@localhost:5432/vault_dev",
        nodeEnv: "test",
      }),
    ).toThrow("vault_test_*");
  });

  it("does not apply the guard outside the test environment", async () => {
    const handle = createDatabase({
      databaseUrl: "postgres://u:p@localhost:5432/vault_dev",
      nodeEnv: "development",
    });
    await handle.close();
  });
});

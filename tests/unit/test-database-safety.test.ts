import { describe, expect, it } from "vitest";
import { assertSafeTestDatabaseUrl } from "../../server/db/test-safety";

describe("test database safety", () => {
  it("accepts only explicitly named test databases", () => {
    expect(assertSafeTestDatabaseUrl("postgres://user:pass@localhost:5432/vault_test")).toContain("vault_test");
  });

  it("rejects development-like URLs before any reset can run", () => {
    expect(() => assertSafeTestDatabaseUrl("postgres://user:pass@localhost:5432/vault")).toThrow("must end with _test");
  });
});
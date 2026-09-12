/**
 * Guard destructive test setup. Test helpers must call this before resetting
 * any database; it deliberately rejects development and production URLs.
 */
export function assertSafeTestDatabaseUrl(
  databaseUrl: string | undefined,
): string {
  if (!databaseUrl)
    throw new Error(
      "TEST_DATABASE_URL is required for database integration tests.",
    );
  const parsed = new URL(databaseUrl);
  if (!parsed.pathname.replace(/^\//, "").endsWith("_test")) {
    throw new Error(
      "Refusing test database reset: database name must end with _test.",
    );
  }
  return databaseUrl;
}

export function assertSafeIsolatedTestDatabaseName(databaseName: string): void {
  if (
    process.env.NODE_ENV !== "test" ||
    !/^vault_test_[a-z0-9_]+$/.test(databaseName)
  ) {
    throw new Error("Refusing unsafe isolated test database setup.");
  }
}

const TEST_DATABASE_NAME = /^vault_test_[a-z0-9_]+$/;

export function databaseNameFromUrl(databaseUrl: string): string {
  return new URL(databaseUrl).pathname.replace(/^\//, "");
}

export function isTestDatabaseName(databaseName: string): boolean {
  return TEST_DATABASE_NAME.test(databaseName);
}

/**
 * Fail-closed guard for the application pool under NODE_ENV=test: the
 * connection must target a disposable `vault_test_*` database.
 */
export function assertTestDatabaseUrl(databaseUrl: string): void {
  const name = databaseNameFromUrl(databaseUrl);
  if (!isTestDatabaseName(name)) {
    throw new Error(
      `Refusing to bind the application pool to "${name}" under NODE_ENV=test: the database name must match vault_test_*.`,
    );
  }
}

/**
 * Guard for destructive test setup (create/drop database). Requires both the
 * test environment and a disposable database name.
 */
export function assertSafeIsolatedTestDatabaseName(databaseName: string): void {
  if (process.env.NODE_ENV !== "test" || !isTestDatabaseName(databaseName)) {
    throw new Error("Refusing unsafe isolated test database setup.");
  }
}

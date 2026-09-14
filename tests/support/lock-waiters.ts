import { Client } from "pg";

/**
 * A second connection for concurrency tests. One use holds a row lock open as
 * a barrier; the other watches `pg_stat_activity` from outside any transaction
 * (statistics views are snapshotted per transaction, so the barrier
 * connection cannot watch itself).
 */
export async function openClient(databaseUrl: string): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

/**
 * Resolves once at least `count` backends on this database are waiting for a
 * lock. This is how a test proves concurrent commands are genuinely inside
 * their transactions, blocked on the same rows, before it releases them.
 */
export async function waitForLockWaiters(
  watcher: Client,
  count: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await watcher.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    );
    if (rows[0].n >= count) return;
    if (Date.now() > deadline)
      throw new Error(
        `Expected ${count} lock waiters, saw ${rows[0].n} after ${timeoutMs}ms.`,
      );
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// Vitest setup: pull `.env.local` into the process for tests that need the
// development cluster credential (to create disposable vault_test_* databases).
// Real environment variables always take precedence.
import "../../server/config/load-env";

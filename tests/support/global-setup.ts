// Vitest global setup (runs once per `vitest run`): drops test databases a
// previous crashed run left behind. Marker-guarded and idle-only; see
// `sweepStaleTestDatabases`.
import "../../server/config/load-env";
import { sweepStaleTestDatabases } from "./isolated-postgres";

export default async function globalSetup() {
  process.env.NODE_ENV = "test";
  await sweepStaleTestDatabases();
}

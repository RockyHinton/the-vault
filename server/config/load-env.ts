import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads `.env.local` into `process.env` for local development and tests.
 *
 * Rules:
 * - Never runs in production; deployment platforms (Replit today) inject
 *   environment variables directly.
 * - Variables already present in the environment always win. Node's built-in
 *   loader does not overwrite existing values, so CI and platform settings
 *   take precedence over the file.
 * - The file is optional. Missing file means "use the process environment".
 *
 * Import this module first from any entrypoint that needs configuration
 * (server start, drizzle-kit config, test setup).
 */
export function loadLocalEnvironment(
  rootDirectory: string = process.cwd(),
): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const file = path.resolve(rootDirectory, ".env.local");
  if (!existsSync(file)) return undefined;
  process.loadEnvFile(file);
  return file;
}

loadLocalEnvironment();

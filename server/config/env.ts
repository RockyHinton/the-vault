import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Comma-separated hostnames this deployment serves. Required in production. */
  REPLIT_DOMAINS: z.string().optional(),
  /** Extra allowed host in development (set by Replit workspaces). */
  REPLIT_DEV_DOMAIN: z.string().optional(),
  /**
   * Where file bytes live. `local` is a directory on this machine (development,
   * tests, or a persistent volume). `replit` names the production object
   * storage adapter, which is a bounded integration milestone (ADR 0008).
   */
  VAULT_STORAGE_PROVIDER: z.enum(["local", "replit"]).default("local"),
  VAULT_STORAGE_LOCAL_DIR: z.string().min(1).default(".vault-data/files"),
  VAULT_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(1024 * 1024 * 1024)
    .default(50 * 1024 * 1024),
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid server environment: ${issues.join("; ")}`);
  }

  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    if (source.VAULT_STORAGE_PROVIDER === undefined) {
      throw new Error(
        "Invalid server environment: VAULT_STORAGE_PROVIDER must be set explicitly in production (a deployment filesystem is not durable).",
      );
    }
    if (!env.REPLIT_DOMAINS) {
      throw new Error(
        "Invalid server environment: REPLIT_DOMAINS is required in production.",
      );
    }
    if (
      env.REPLIT_DOMAINS.split(",").some(
        (domain) => !/^[a-z0-9.-]+$/i.test(domain.trim()),
      )
    ) {
      throw new Error(
        "Invalid server environment: REPLIT_DOMAINS must contain bare HTTPS hostnames.",
      );
    }
  }
  return env;
}

/** Hostnames the HTTP layer accepts. Production is strict; development adds loopback. */
export function allowedHosts(env: Environment): string[] {
  if (env.NODE_ENV === "production") {
    return env
      .REPLIT_DOMAINS!.split(",")
      .map((host) => host.trim())
      .filter(Boolean);
  }
  return [env.REPLIT_DEV_DOMAIN, "localhost", "127.0.0.1"].filter(
    (host): host is string => Boolean(host),
  );
}

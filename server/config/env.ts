import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /**
   * Comma-separated bare hostnames this deployment serves (the host and
   * origin guards refuse any other). The provider-neutral setting; required
   * in production unless `REPLIT_DOMAINS` supplies it. In development these
   * hosts are allowed in addition to loopback.
   */
  VAULT_ALLOWED_HOSTS: z.string().optional(),
  /** Set by Replit deployments; used as the production host list when `VAULT_ALLOWED_HOSTS` is absent. */
  REPLIT_DOMAINS: z.string().optional(),
  /** Set by Replit workspaces; an extra allowed host outside production. */
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

const hostList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

/** The configured production host list: the explicit setting wins over the Replit-provided one. */
function deploymentHosts(env: Environment): string[] {
  return hostList(env.VAULT_ALLOWED_HOSTS ?? env.REPLIT_DOMAINS);
}

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
  const configured = hostList(env.VAULT_ALLOWED_HOSTS);
  if (configured.some((host) => !/^[a-z0-9.-]+$/i.test(host))) {
    throw new Error(
      "Invalid server environment: VAULT_ALLOWED_HOSTS must contain bare hostnames.",
    );
  }
  if (env.NODE_ENV === "production") {
    if (source.VAULT_STORAGE_PROVIDER === undefined) {
      throw new Error(
        "Invalid server environment: VAULT_STORAGE_PROVIDER must be set explicitly in production (a deployment filesystem is not durable).",
      );
    }
    const hosts = deploymentHosts(env);
    if (hosts.length === 0) {
      throw new Error(
        "Invalid server environment: VAULT_ALLOWED_HOSTS (or REPLIT_DOMAINS on Replit) is required in production.",
      );
    }
    if (hosts.some((host) => !/^[a-z0-9.-]+$/i.test(host))) {
      throw new Error(
        "Invalid server environment: allowed hosts must be bare HTTPS hostnames.",
      );
    }
  }
  return env;
}

/**
 * Hostnames the HTTP layer accepts. Production is exactly the configured
 * list; elsewhere the configured hosts, the Replit workspace host and loopback.
 */
export function allowedHosts(env: Environment): string[] {
  if (env.NODE_ENV === "production") return deploymentHosts(env);
  return Array.from(
    new Set([
      ...hostList(env.VAULT_ALLOWED_HOSTS),
      ...hostList(env.REPLIT_DEV_DOMAIN),
      "localhost",
      "127.0.0.1",
    ]),
  );
}

import { z } from "zod";
import { STORAGE_PREFIX_PATTERN } from "../files/file-storage";

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
   * tests, or a persistent volume). `replit` is Replit App Storage through the
   * adapter in `server/files/replit-file-storage.ts` (ADR 0008).
   */
  VAULT_STORAGE_PROVIDER: z.enum(["local", "replit"]).default("local"),
  VAULT_STORAGE_LOCAL_DIR: z.string().min(1).default(".vault-data/files"),
  /**
   * The object-storage bucket, required whenever the provider is not `local`.
   * It names the instance, not the kind, and is what keeps a development
   * deployment from writing into production's store. Never committed.
   */
  VAULT_STORAGE_BUCKET: z.string().trim().min(1).optional(),
  /**
   * Optional key prefix inside the bucket (`dev/`, `production/`). A second
   * line of defence, not a substitute for separate buckets.
   */
  VAULT_STORAGE_PREFIX: z.string().trim().optional(),
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
  // A non-local provider addresses one named bucket. Without this, two
  // deployments configured the same way would share one object store, and a
  // development sweep would delete production bytes.
  if (env.VAULT_STORAGE_PROVIDER !== "local" && !env.VAULT_STORAGE_BUCKET) {
    throw new Error(
      `Invalid server environment: VAULT_STORAGE_BUCKET is required when VAULT_STORAGE_PROVIDER=${env.VAULT_STORAGE_PROVIDER}.`,
    );
  }
  if (
    env.VAULT_STORAGE_PREFIX !== undefined &&
    env.VAULT_STORAGE_PREFIX !== "" &&
    !STORAGE_PREFIX_PATTERN.test(env.VAULT_STORAGE_PREFIX)
  ) {
    throw new Error(
      "Invalid server environment: VAULT_STORAGE_PREFIX must be slash-separated segments of letters, digits, dot, underscore or hyphen, each starting with a letter or digit.",
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
 * list; elsewhere the configured hosts, the Replit workspace hosts and
 * loopback.
 *
 * Both Replit host variables are read outside production because a workspace
 * may expose the preview under either: `REPLIT_DEV_DOMAIN` alone, or
 * `REPLIT_DOMAINS`. Neither is trusted in production, where the host list is
 * exactly what was configured, and neither widens anything — a host still has
 * to match a value the platform itself set. `VAULT_ALLOWED_HOSTS` remains the
 * portable setting and the one to prefer.
 */
export function allowedHosts(env: Environment): string[] {
  if (env.NODE_ENV === "production") return deploymentHosts(env);
  return Array.from(
    new Set([
      ...hostList(env.VAULT_ALLOWED_HOSTS),
      ...hostList(env.REPLIT_DEV_DOMAIN),
      ...hostList(env.REPLIT_DOMAINS),
      "localhost",
      "127.0.0.1",
    ]),
  );
}

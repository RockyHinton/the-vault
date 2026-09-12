import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  VAULT_BOOTSTRAP_ADMIN_CLERK_ID: z.string().min(1).optional(),
  REPLIT_DOMAINS: z.string().optional(),
  REPLIT_DEV_DOMAIN: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * The browser and the server share one Clerk publishable key. Locally the
 * Clerk CLI writes only `VITE_CLERK_PUBLISHABLE_KEY`, so the server accepts it
 * as a fallback; an explicit `CLERK_PUBLISHABLE_KEY` (Replit-managed Clerk)
 * always wins.
 */
function withPublishableKeyFallback(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (source.CLERK_PUBLISHABLE_KEY || !source.VITE_CLERK_PUBLISHABLE_KEY)
    return source;
  return {
    ...source,
    CLERK_PUBLISHABLE_KEY: source.VITE_CLERK_PUBLISHABLE_KEY,
  };
}

export function readEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  const parsed = environmentSchema.safeParse(
    withPublishableKeyFallback(source),
  );
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid server environment: ${issues.join("; ")}`);
  }

  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    if (!env.REPLIT_DOMAINS) {
      throw new Error(
        "Invalid server environment: REPLIT_DOMAINS is required in production.",
      );
    }
    if (
      !env.CLERK_PUBLISHABLE_KEY.startsWith("pk_live_") ||
      !env.CLERK_SECRET_KEY.startsWith("sk_live_")
    ) {
      throw new Error(
        "Invalid server environment: production requires live Clerk keys.",
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

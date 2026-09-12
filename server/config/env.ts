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
  DATABASE_SCHEMA: z
    .string()
    .regex(/^vault_test_[a-z0-9_]+$/)
    .optional(),
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

  if (parsed.data.NODE_ENV === "production" && !parsed.data.REPLIT_DOMAINS) {
    throw new Error(
      "Invalid server environment: REPLIT_DOMAINS is required in production.",
    );
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    (!parsed.data.CLERK_PUBLISHABLE_KEY.startsWith("pk_live_") ||
      !parsed.data.CLERK_SECRET_KEY.startsWith("sk_live_"))
  ) {
    throw new Error(
      "Invalid server environment: production requires live Clerk keys.",
    );
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    parsed.data
      .REPLIT_DOMAINS!.split(",")
      .some((domain) => !/^[a-z0-9.-]+$/i.test(domain.trim()))
  ) {
    throw new Error(
      "Invalid server environment: REPLIT_DOMAINS must contain bare HTTPS hostnames.",
    );
  }
  if (parsed.data.DATABASE_SCHEMA && parsed.data.NODE_ENV !== "test") {
    throw new Error(
      "Invalid server environment: DATABASE_SCHEMA is test-only.",
    );
  }
  return parsed.data;
}

// Operator-only first-admin bootstrap. Usage:
//
//   VAULT_BOOTSTRAP_ADMIN_EMAIL=... VAULT_BOOTSTRAP_ADMIN_PASSWORD=... \
//   VAULT_BOOTSTRAP_ADMIN_NAME="..." npm run bootstrap:admin
//
// Locally the three variables can live in `.env.local`; remove the password
// line afterwards. Never exposed over HTTP. Fails closed on any inconsistency.
import "../server/config/load-env";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { passwordSchema } from "@shared/contracts";
import { readEnvironment } from "../server/config/env";
import { createDatabase } from "../server/db/client";
import {
  BootstrapRefusedError,
  bootstrapStudioAdmin,
} from "../server/modules/users/bootstrap-admin";

const inputSchema = z.object({
  VAULT_BOOTSTRAP_ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
  VAULT_BOOTSTRAP_ADMIN_PASSWORD: passwordSchema,
  VAULT_BOOTSTRAP_ADMIN_NAME: z.string().trim().min(1).max(120),
});

async function main() {
  const env = readEnvironment();
  const parsed = inputSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new BootstrapRefusedError(
      `Bootstrap needs VAULT_BOOTSTRAP_ADMIN_EMAIL, VAULT_BOOTSTRAP_ADMIN_PASSWORD (12+ characters) and VAULT_BOOTSTRAP_ADMIN_NAME. Invalid or missing: ${missing}.`,
    );
  }
  const input = parsed.data;
  const database = createDatabase({
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV,
  });
  try {
    const result = await bootstrapStudioAdmin(
      { db: database.db },
      {
        email: input.VAULT_BOOTSTRAP_ADMIN_EMAIL,
        password: input.VAULT_BOOTSTRAP_ADMIN_PASSWORD,
        displayName: input.VAULT_BOOTSTRAP_ADMIN_NAME,
        requestId: randomUUID(),
      },
    );
    if (result.outcome === "already_bootstrapped") {
      console.log(
        `Already bootstrapped: ${input.VAULT_BOOTSTRAP_ADMIN_EMAIL} is an active studio_admin (user ${result.userId}). Nothing changed.`,
      );
    } else {
      console.log(
        `Bootstrapped studio_admin ${input.VAULT_BOOTSTRAP_ADMIN_EMAIL} (user ${result.userId}).`,
      );
    }
    console.log(
      "Next: remove VAULT_BOOTSTRAP_ADMIN_PASSWORD from your environment, then sign in at /sign-in.",
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    error instanceof BootstrapRefusedError
      ? `Bootstrap refused: ${message}`
      : `Bootstrap failed: ${message}`,
  );
  process.exit(1);
});

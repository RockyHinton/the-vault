import path from "node:path";
import type { Environment } from "../config/env";
import { log } from "../observability/logger";
import { StorageError, type FileStorage } from "./file-storage";
import { createLocalFileStorage } from "./local-file-storage";
import { createReplitFileStorage } from "./replit-file-storage";

/**
 * Chooses the storage implementation from configuration. This is the only
 * place provider names appear; everything above it sees `FileStorage`.
 *
 * `local`: a directory (development, tests, or a persistent volume).
 * `replit`: Replit App Storage, addressed by an explicit bucket so a
 * deployment can never inherit another environment's object store.
 */
export function createFileStorage(env: Environment): FileStorage {
  switch (env.VAULT_STORAGE_PROVIDER) {
    case "local": {
      const rootDirectory = path.resolve(env.VAULT_STORAGE_LOCAL_DIR);
      if (env.NODE_ENV === "production") {
        log("warn", "storage.local_in_production", {
          rootDirectory,
          message:
            "Local file storage in production is only durable on a persistent volume, never on an ephemeral deployment filesystem.",
        });
      }
      return createLocalFileStorage({ rootDirectory, nodeEnv: env.NODE_ENV });
    }
    case "replit": {
      // `readEnvironment` already refuses this combination; repeated here so
      // the factory is safe for any caller that builds an Environment itself.
      const bucketId = env.VAULT_STORAGE_BUCKET;
      if (!bucketId) {
        throw new StorageError(
          "VAULT_STORAGE_BUCKET is required when VAULT_STORAGE_PROVIDER=replit.",
        );
      }
      // Logged so an operator can confirm which environment's store a running
      // deployment is attached to. The bucket id is configuration, not a
      // credential: the SDK obtains credentials from the Replit workspace.
      log("info", "storage.replit_selected", {
        bucketId,
        prefix: env.VAULT_STORAGE_PREFIX ?? "",
      });
      return createReplitFileStorage({
        bucketId,
        prefix: env.VAULT_STORAGE_PREFIX,
      });
    }
  }
}

import path from "node:path";
import type { Environment } from "../config/env";
import { log } from "../observability/logger";
import { StorageError, type FileStorage } from "./file-storage";
import { createLocalFileStorage } from "./local-file-storage";

/**
 * Chooses the storage implementation from configuration. This is the only
 * place provider names appear; everything above it sees `FileStorage`.
 *
 * `replit`: production object storage. The adapter is a bounded integration
 * milestone (ADR 0008): it must implement `FileStorage` against the
 * installed `@replit/object-storage` client and be verified on a real
 * deployment. Until then, selecting it fails closed here rather than
 * silently falling back to a deployment filesystem.
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
    case "replit":
      throw new StorageError(
        "VAULT_STORAGE_PROVIDER=replit is not implemented in this build. Implement the FileStorage contract over @replit/object-storage (see ADR 0008) before deploying with it.",
      );
  }
}

import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, link, mkdir, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  ObjectAlreadyExistsError,
  ObjectNotFoundError,
  StorageError,
  assertStorageKey,
  type FileStorage,
} from "./file-storage";

export const TEST_STORAGE_ROOT_PREFIX = "vault_test_storage_";

/**
 * Directory-backed storage. Suitable for development, tests and any host
 * with a persistent volume. Not suitable for an ephemeral deployment
 * filesystem: bytes would vanish on redeploy.
 *
 * Writes go to a temporary file, then are hard-linked to the final path with
 * an exclusive create, so a partial write is never visible and an existing
 * object is never overwritten.
 */
export function createLocalFileStorage(options: {
  rootDirectory: string;
  nodeEnv: string;
}): FileStorage {
  const root = path.resolve(options.rootDirectory);
  if (
    options.nodeEnv === "test" &&
    !path.basename(root).startsWith(TEST_STORAGE_ROOT_PREFIX)
  ) {
    throw new StorageError(
      `Refusing to use "${root}" as file storage under NODE_ENV=test: the directory name must start with ${TEST_STORAGE_ROOT_PREFIX}.`,
    );
  }
  const tmpDir = path.join(root, ".tmp");
  const objectPath = (key: string) => {
    assertStorageKey(key);
    const resolved = path.resolve(root, key);
    if (!resolved.startsWith(root + path.sep))
      throw new StorageError("Key escapes storage root.");
    return resolved;
  };

  return {
    async put(key, source) {
      const finalPath = objectPath(key);
      await mkdir(tmpDir, { recursive: true });
      const tmpPath = path.join(tmpDir, randomUUID());
      try {
        await pipeline(source, createWriteStream(tmpPath, { flags: "wx" }));
        await mkdir(path.dirname(finalPath), { recursive: true });
        try {
          await link(tmpPath, finalPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST")
            throw new ObjectAlreadyExistsError(key);
          throw error;
        }
      } finally {
        await unlink(tmpPath).catch(() => undefined);
      }
    },

    async open(key) {
      const finalPath = objectPath(key);
      try {
        await stat(finalPath);
      } catch {
        throw new ObjectNotFoundError(key);
      }
      return createReadStream(finalPath);
    },

    async delete(key) {
      await rm(objectPath(key), { force: true });
    },

    async exists(key) {
      try {
        await access(objectPath(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileStorage } from "../../server/files/file-storage";
import {
  TEST_STORAGE_ROOT_PREFIX,
  createLocalFileStorage,
} from "../../server/files/local-file-storage";

export interface TestStorage {
  storage: FileStorage;
  rootDirectory: string;
  destroy(): Promise<void>;
}

/**
 * An isolated temporary directory per suite, named so the local adapter's
 * fail-closed guard accepts it, removed afterwards. Never the developer's
 * real `.vault-data`.
 */
export async function createTestStorage(): Promise<TestStorage> {
  const rootDirectory = await mkdtemp(
    path.join(os.tmpdir(), TEST_STORAGE_ROOT_PREFIX),
  );
  return {
    storage: createLocalFileStorage({ rootDirectory, nodeEnv: "test" }),
    rootDirectory,
    destroy: () => rm(rootDirectory, { recursive: true, force: true }),
  };
}

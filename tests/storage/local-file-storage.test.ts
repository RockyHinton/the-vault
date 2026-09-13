import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { generateStorageKey } from "../../server/files/file-storage";
import { createLocalFileStorage } from "../../server/files/local-file-storage";
import { storageContractTests } from "../support/storage-contract";
import { createTestStorage } from "../support/test-storage";

storageContractTests("local directory", async () => {
  const test = await createTestStorage();
  return { storage: test.storage, destroy: test.destroy };
});

describe("local file storage safety", () => {
  it("refuses a root that is not a test storage directory under NODE_ENV=test", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "not-for-tests-"));
    try {
      expect(() =>
        createLocalFileStorage({ rootDirectory: root, nodeEnv: "test" }),
      ).toThrow("vault_test_storage_");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stores objects under fanned-out random keys and keeps no temp files", async () => {
    const test = await createTestStorage();
    try {
      const key = generateStorageKey();
      await test.storage.put(key, Readable.from([Buffer.from("bytes")]));
      const [top] = await readdir(test.rootDirectory);
      expect(await readdir(path.join(test.rootDirectory, ".tmp"))).toEqual([]);
      expect(top === ".tmp" || /^[a-f0-9]{2}$/.test(top)).toBe(true);
      expect(key).toMatch(/^[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}$/);
      expect(generateStorageKey()).not.toBe(key);
    } finally {
      await test.destroy();
    }
  });
});

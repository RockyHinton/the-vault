import { randomUUID } from "node:crypto";
import { Client } from "@replit/object-storage";
import { describe } from "vitest";
import { createReplitFileStorage } from "../../server/files/replit-file-storage";
import { storageContractTests } from "../support/storage-contract";

/**
 * The FileStorage contract against a REAL Replit App Storage bucket.
 *
 * This is the acceptance gate for the Replit adapter and it cannot run on a
 * developer machine: `@replit/object-storage` obtains credentials from a
 * workspace-local Replit sidecar, so it only works inside a Replit workspace.
 * The suite therefore skips unless a bucket is named explicitly.
 *
 * Run it inside the imported Replit DEVELOPMENT workspace:
 *
 *   VAULT_REPLIT_LIVE_STORAGE_BUCKET=<development-bucket-id> \
 *     npx vitest run tests/storage/replit-file-storage.live.test.ts
 *
 * Safety: the variable is deliberately NOT `VAULT_STORAGE_BUCKET`, so a
 * configured deployment is never used by a test run by accident, and every
 * object is written under a unique `vault_test_storage_*` prefix that is swept
 * afterwards. Never point it at the production bucket.
 */
const bucketId = process.env.VAULT_REPLIT_LIVE_STORAGE_BUCKET;

describe.skipIf(!bucketId)("Replit App Storage, live bucket", () => {
  storageContractTests("Replit App Storage", async () => {
    if (!bucketId) throw new Error("A live bucket id is required.");
    const prefix = `vault_test_storage_${randomUUID().replaceAll("-", "")}`;
    const client = new Client({ bucketId });
    return {
      storage: createReplitFileStorage({ bucketId, prefix, client }),
      async destroy() {
        const listed = await client.list({ prefix: `${prefix}/` });
        if (!listed.ok) return;
        for (const object of listed.value) {
          await client.delete(object.name, { ignoreNotFound: true });
        }
      },
    };
  });
});

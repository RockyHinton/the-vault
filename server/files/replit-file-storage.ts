import { PassThrough } from "node:stream";
import type { Client } from "@replit/object-storage";
import {
  ObjectAlreadyExistsError,
  ObjectNotFoundError,
  StorageError,
  assertStorageKey,
  normaliseStoragePrefix,
  type FileStorage,
} from "./file-storage";

/**
 * The part of the Replit App Storage client this adapter uses, taken from the
 * SDK's own types so a signature change is a type error rather than a runtime
 * surprise. Narrowing it here also lets the unit tests supply a fake without
 * a live bucket (see `tests/unit/replit-file-storage.test.ts`).
 */
export type ReplitObjectStorageClient = Pick<
  Client,
  "uploadFromStream" | "downloadAsStream" | "exists" | "delete"
>;

export interface ReplitFileStorageOptions {
  /**
   * The App Storage bucket. Always explicit: passing it means the SDK never
   * asks the Replit sidecar for a default bucket, so constructing the client
   * cannot fail (or reject in the background) outside a Replit workspace, and
   * development can never silently inherit production's bucket.
   */
  bucketId: string;
  /** Optional key prefix, e.g. `dev/`. Normalised to end with exactly one `/`. */
  prefix?: string;
  /** Injection seam for tests; production loads the real SDK lazily. */
  client?: ReplitObjectStorageClient;
}

/**
 * Object-storage adapter for Replit App Storage (`@replit/object-storage`).
 *
 * It implements `FileStorage` and nothing else: keys, lifecycle, statuses and
 * policy all stay where they were, and no code above `server/files` can tell
 * this apart from the local directory adapter. No URL is ever produced.
 *
 * Three provider facts shape the implementation, all verified against the
 * installed SDK (v1.0.0) rather than assumed:
 *
 * 1. **Uploads overwrite.** The SDK exposes no conditional or exclusive-create
 *    option, so exclusivity is an `exists` check before the upload. That is
 *    best-effort, not atomic: two concurrent writers of the same key could
 *    both pass it. Vault keys are 32 cryptographically random bytes generated
 *    server-side and used once, so a collision is not a practical concern —
 *    but the weaker guarantee is recorded here rather than papered over.
 * 2. **`uploadFromStream` pipes the source into the provider's write stream**,
 *    and `pipe` does not forward a source failure to the destination. Its
 *    promise can therefore stay pending forever when the client goes away
 *    mid-upload, which would hang `FileService.stageUpload`. The upload is
 *    raced against the source's own `error` event so an aborted request fails
 *    fast, and the (possibly incomplete) object is then deleted.
 * 3. **`downloadAsStream` returns immediately** and reports a missing object
 *    asynchronously on the stream, so `open` checks existence first to keep
 *    its contract ("rejects with ObjectNotFoundError") and still translates a
 *    late provider error on the stream it hands back.
 *
 * Compression is disabled on upload and left enabled on download. Bytes must
 * round-trip exactly — `file_objects.byte_size` is the `Content-Length` the
 * download route sends and `sha256` is checked against the original — and a
 * stored object with no content encoding is returned unchanged either way.
 * The two settings belong together: never enable one without the other.
 */
export function createReplitFileStorage(
  options: ReplitFileStorageOptions,
): FileStorage {
  const prefix = normaliseStoragePrefix(options.prefix);
  const bucketId = options.bucketId.trim();
  if (!bucketId) throw new StorageError("A bucket id is required.");

  /**
   * The SDK is loaded on first use, not at startup: a deployment using the
   * local adapter never pays for it, and nothing touches the provider while
   * the process is still assembling itself.
   */
  let pending: Promise<ReplitObjectStorageClient> | undefined;
  const getClient = (): Promise<ReplitObjectStorageClient> => {
    if (options.client) return Promise.resolve(options.client);
    pending ??= import("@replit/object-storage")
      .then((sdk) => new sdk.Client({ bucketId }))
      .catch((error: unknown) => {
        pending = undefined;
        throw new StorageError(
          `Could not initialise Replit App Storage: ${messageOf(error)}`,
        );
      });
    return pending;
  };

  /** Validates the key, then prefixes it. The key format forbids traversal. */
  const objectName = (key: string): string => {
    assertStorageKey(key);
    return `${prefix}${key}`;
  };

  const objectExists = async (
    client: ReplitObjectStorageClient,
    name: string,
  ): Promise<boolean> => {
    const result = await client.exists(name);
    if (!result.ok) {
      throw new StorageError(
        `Could not check object existence: ${result.error.message}`,
      );
    }
    return result.value;
  };

  return {
    async put(key, source) {
      const name = objectName(key);
      const client = await getClient();
      if (await objectExists(client, name)) {
        throw new ObjectAlreadyExistsError(key);
      }

      // A failure raised by the source (an aborted request, or the upload
      // inspector's own size/media-type rejection) must reach the caller
      // unchanged: `FileService` turns those into 413/415, not 500.
      let sourceFailure: unknown;
      try {
        await new Promise<void>((resolve, reject) => {
          source.once("error", (error: unknown) => {
            sourceFailure = error;
            reject(error);
          });
          client
            .uploadFromStream(name, source, { compress: false })
            .then(resolve, reject);
        });
      } catch (error) {
        // Compensation: a partial or orphaned object must not remain, or the
        // next attempt with this key would see it and refuse.
        await client
          .delete(name, { ignoreNotFound: true })
          .catch(() => undefined);
        if (sourceFailure !== undefined) throw sourceFailure;
        throw new StorageError(`Upload failed: ${messageOf(error)}`);
      }
    },

    async open(key) {
      const name = objectName(key);
      const client = await getClient();
      if (!(await objectExists(client, name))) {
        throw new ObjectNotFoundError(key);
      }
      const download = client.downloadAsStream(name, { decompress: true });
      // The provider reports failures on the stream, after this function has
      // returned. Translate them so no SDK error type escapes the adapter.
      const out = new PassThrough();
      download.on("error", (error: unknown) => {
        out.destroy(
          providerStatusCode(error) === 404
            ? new ObjectNotFoundError(key)
            : new StorageError(`Download failed: ${messageOf(error)}`),
        );
      });
      download.pipe(out);
      return out;
    },

    async delete(key) {
      const name = objectName(key);
      const client = await getClient();
      const result = await client.delete(name, { ignoreNotFound: true });
      if (!result.ok) {
        throw new StorageError(`Delete failed: ${result.error.message}`);
      }
    },

    async exists(key) {
      const name = objectName(key);
      return objectExists(await getClient(), name);
    },
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * The provider's HTTP status, wherever it is carried. The SDK wraps stream
 * failures in `StreamRequestError`, which exposes `getRequestError()`; plain
 * results carry `statusCode` directly. Read structurally so the adapter does
 * not import an SDK value (and keeps working if the wrapper changes).
 */
function providerStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    getRequestError?: unknown;
    statusCode?: unknown;
  };
  if (typeof candidate.getRequestError === "function") {
    const request: unknown = (
      candidate as { getRequestError: () => unknown }
    ).getRequestError();
    if (request && typeof request === "object") {
      const status = (request as { statusCode?: unknown }).statusCode;
      if (typeof status === "number") return status;
    }
  }
  return typeof candidate.statusCode === "number"
    ? candidate.statusCode
    : undefined;
}

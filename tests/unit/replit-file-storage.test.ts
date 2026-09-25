import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  InvalidStoragePrefixError,
  InvalidStorageKeyError,
  ObjectAlreadyExistsError,
  ObjectNotFoundError,
  StorageError,
  generateStorageKey,
  normaliseStoragePrefix,
} from "../../server/files/file-storage";
import {
  createReplitFileStorage,
  type ReplitObjectStorageClient,
} from "../../server/files/replit-file-storage";

/**
 * These tests cover the adapter's own translation layer — key validation,
 * prefixing, exclusive-create, error mapping, compensation — against a fake
 * client with the SDK's types. They deliberately prove nothing about Replit
 * App Storage itself: the SDK reaches a workspace-local sidecar for
 * credentials, so the real provider can only be exercised inside a Replit
 * workspace. That live gate is `tests/storage/replit-file-storage.live.test.ts`.
 */

/** Shaped like the SDK's `StreamRequestError`, which the adapter reads structurally. */
class FakeStreamRequestError extends Error {
  constructor(private readonly status: number) {
    super(`${status}: provider failure`);
  }
  getRequestError() {
    return { message: "provider failure", statusCode: this.status };
  }
}

interface FakeOptions {
  /** Never settles, to prove the source-error race releases a stuck upload. */
  uploadHangs?: boolean;
  uploadRejects?: Error;
  existsFails?: boolean;
  deleteFails?: boolean;
  downloadError?: unknown;
}

function createFakeClient(options: FakeOptions = {}) {
  const objects = new Map<string, Buffer>();
  const calls: string[] = [];
  const client: ReplitObjectStorageClient = {
    async uploadFromStream(objectName, stream, uploadOptions) {
      calls.push(`upload:${objectName}:compress=${uploadOptions?.compress}`);
      if (options.uploadHangs) return new Promise<void>(() => undefined);
      if (options.uploadRejects) throw options.uploadRejects;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      objects.set(objectName, Buffer.concat(chunks));
    },
    downloadAsStream(objectName, downloadOptions) {
      calls.push(
        `download:${objectName}:decompress=${downloadOptions?.decompress}`,
      );
      const out = new PassThrough();
      if (options.downloadError !== undefined) {
        setImmediate(() => out.emit("error", options.downloadError));
        return out;
      }
      const bytes = objects.get(objectName);
      if (bytes) out.end(bytes);
      else
        setImmediate(() => out.emit("error", new FakeStreamRequestError(404)));
      return out;
    },
    async exists(objectName) {
      calls.push(`exists:${objectName}`);
      if (options.existsFails)
        return { ok: false, error: { message: "exists blew up" } };
      return { ok: true, value: objects.has(objectName) };
    },
    async delete(objectName, deleteOptions) {
      calls.push(
        `delete:${objectName}:ignore=${deleteOptions?.ignoreNotFound}`,
      );
      if (options.deleteFails)
        return { ok: false, error: { message: "delete blew up" } };
      objects.delete(objectName);
      return { ok: true, value: null };
    },
  };
  return { client, objects, calls };
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe("storage prefix normalisation", () => {
  it("normalises a configured prefix to one trailing slash", () => {
    expect(normaliseStoragePrefix(undefined)).toBe("");
    expect(normaliseStoragePrefix("  ")).toBe("");
    expect(normaliseStoragePrefix("dev")).toBe("dev/");
    expect(normaliseStoragePrefix("dev/")).toBe("dev/");
    expect(normaliseStoragePrefix(" vault/production ")).toBe(
      "vault/production/",
    );
    expect(normaliseStoragePrefix("a_b.c-1")).toBe("a_b.c-1/");
  });

  it("refuses a prefix that could escape or confuse the key space", () => {
    for (const prefix of [
      "/dev",
      "dev//x",
      "../dev",
      "dev/../..",
      "dev\\x",
      "dev x",
      ".hidden",
      "-dash",
    ]) {
      expect(() => normaliseStoragePrefix(prefix)).toThrow(
        InvalidStoragePrefixError,
      );
    }
  });
});

describe("Replit file storage adapter", () => {
  it("round-trips bytes and addresses the object under the configured prefix", async () => {
    const fake = createFakeClient();
    const storage = createReplitFileStorage({
      bucketId: "bucket-under-test",
      prefix: "dev",
      client: fake.client,
    });
    const key = generateStorageKey();
    const bytes = Buffer.from("%PDF-1.4\nbinary\n", "latin1");

    expect(await storage.exists(key)).toBe(false);
    await storage.put(key, Readable.from([bytes]));
    expect(await storage.exists(key)).toBe(true);
    expect(await readAll(await storage.open(key))).toEqual(bytes);

    expect(Array.from(fake.objects.keys())).toEqual([`dev/${key}`]);
    // Compression off on the way in, decompression on on the way out, so the
    // stored object is byte-identical to what the uploader sent.
    expect(fake.calls).toContain(`upload:dev/${key}:compress=false`);
    expect(fake.calls).toContain(`download:dev/${key}:decompress=true`);
  });

  it("uses the bare key when no prefix is configured", async () => {
    const fake = createFakeClient();
    const storage = createReplitFileStorage({
      bucketId: "bucket",
      client: fake.client,
    });
    const key = generateStorageKey();
    await storage.put(key, Readable.from([Buffer.from("x")]));
    expect(Array.from(fake.objects.keys())).toEqual([key]);
  });

  it("rejects keys it did not generate before calling the provider", async () => {
    const fake = createFakeClient();
    const storage = createReplitFileStorage({
      bucketId: "bucket",
      client: fake.client,
    });
    for (const key of [
      "../escape",
      "ab/../../etc/passwd",
      "ab/cd/short",
      "AB/CD/" + "a".repeat(64),
      "ab/cd/" + "g".repeat(64),
      "",
    ]) {
      await expect(
        storage.put(key, Readable.from([Buffer.from("x")])),
      ).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(storage.open(key)).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
      await expect(storage.delete(key)).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
      await expect(storage.exists(key)).rejects.toBeInstanceOf(
        InvalidStorageKeyError,
      );
    }
    expect(fake.calls).toEqual([]);
  });

  it("refuses to overwrite an existing object and leaves it intact", async () => {
    const fake = createFakeClient();
    const storage = createReplitFileStorage({
      bucketId: "bucket",
      client: fake.client,
    });
    const key = generateStorageKey();
    await storage.put(key, Readable.from([Buffer.from("first")]));
    await expect(
      storage.put(key, Readable.from([Buffer.from("second")])),
    ).rejects.toBeInstanceOf(ObjectAlreadyExistsError);
    expect((await readAll(await storage.open(key))).toString()).toBe("first");
  });

  it("reports a missing object and deletes idempotently", async () => {
    const fake = createFakeClient();
    const storage = createReplitFileStorage({
      bucketId: "bucket",
      client: fake.client,
    });
    const key = generateStorageKey();
    await expect(storage.open(key)).rejects.toBeInstanceOf(ObjectNotFoundError);
    await storage.delete(key);
    await storage.put(key, Readable.from([Buffer.from("x")]));
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    await storage.delete(key);
    expect(fake.calls).toContain(`delete:${key}:ignore=true`);
  });

  it("translates a late provider failure on the download stream", async () => {
    const notFound = createFakeClient({
      downloadError: new FakeStreamRequestError(404),
    });
    const key = generateStorageKey();
    notFound.objects.set(key, Buffer.from("present"));
    await expect(
      readAll(
        await createReplitFileStorage({
          bucketId: "bucket",
          client: notFound.client,
        }).open(key),
      ),
    ).rejects.toBeInstanceOf(ObjectNotFoundError);

    const broken = createFakeClient({
      downloadError: new FakeStreamRequestError(503),
    });
    broken.objects.set(key, Buffer.from("present"));
    await expect(
      readAll(
        await createReplitFileStorage({
          bucketId: "bucket",
          client: broken.client,
        }).open(key),
      ),
    ).rejects.toBeInstanceOf(StorageError);
  });

  it("maps provider failures on exists and delete to StorageError", async () => {
    const key = generateStorageKey();
    const failedExists = createReplitFileStorage({
      bucketId: "bucket",
      client: createFakeClient({ existsFails: true }).client,
    });
    await expect(failedExists.exists(key)).rejects.toBeInstanceOf(StorageError);
    await expect(failedExists.open(key)).rejects.toBeInstanceOf(StorageError);

    const failedDelete = createReplitFileStorage({
      bucketId: "bucket",
      client: createFakeClient({ deleteFails: true }).client,
    });
    await expect(failedDelete.delete(key)).rejects.toBeInstanceOf(StorageError);
  });

  it("maps a provider upload failure to StorageError and removes the object", async () => {
    const fake = createFakeClient({
      uploadRejects: new Error("upstream reset"),
    });
    const storage = createReplitFileStorage({
      bucketId: "bucket",
      client: fake.client,
    });
    const key = generateStorageKey();
    await expect(
      storage.put(key, Readable.from([Buffer.from("x")])),
    ).rejects.toBeInstanceOf(StorageError);
    expect(fake.calls).toContain(`delete:${key}:ignore=true`);
  });

  it("re-raises a source failure unchanged so the upload's own status survives", async () => {
    // FileService turns the inspector's errors into 413/415; wrapping them in
    // StorageError here would turn a rejected upload into a 500.
    const fake = createFakeClient();
    const storage = createReplitFileStorage({
      bucketId: "bucket",
      client: fake.client,
    });
    const key = generateStorageKey();
    const failing = new Readable({
      read() {
        this.push(Buffer.from("partial"));
        this.destroy(new Error("client went away"));
      },
    });
    await expect(storage.put(key, failing)).rejects.toThrow("client went away");
    expect(await storage.exists(key)).toBe(false);
    expect(fake.calls).toContain(`delete:${key}:ignore=true`);
  });

  it("fails fast when the provider upload never settles after the source dies", async () => {
    // `uploadFromStream` pipes the source into the provider's write stream, and
    // pipe does not forward a source failure, so its promise can stay pending.
    const fake = createFakeClient({ uploadHangs: true });
    const storage = createReplitFileStorage({
      bucketId: "bucket",
      client: fake.client,
    });
    const source = new PassThrough();
    const put = storage.put(generateStorageKey(), source);
    setImmediate(() => source.destroy(new Error("aborted")));
    await expect(put).rejects.toThrow("aborted");
  });

  it("requires a bucket id", () => {
    expect(() =>
      createReplitFileStorage({
        bucketId: "   ",
        client: createFakeClient().client,
      }),
    ).toThrow(StorageError);
  });
});

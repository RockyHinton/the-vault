import { createHash } from "node:crypto";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FileObject } from "@shared/contracts";
import type { FileObjectRow } from "@shared/schema";
import type { Database } from "../../db/client";
import {
  ObjectNotFoundError,
  generateStorageKey,
  type FileStorage,
} from "../../files/file-storage";
import { ApiError } from "../../http/errors";
import { log } from "../../observability/logger";
import { fileRepository } from "./file-repository";
import { SNIFF_LENGTH, detectMediaType, sanitiseFilename } from "./media-types";

export interface FileActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

export function toFileObjectContract(row: FileObjectRow): FileObject {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    mediaType: row.mediaType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    createdAt: row.createdAt.toISOString(),
  };
}

/** How long an unclaimed staged upload lives before the sweep removes it. */
export const STAGED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Inspects the byte stream once, on the way to storage: enforces the size
 * limit, sniffs the media type from the first bytes, and hashes everything.
 * Rejecting mid-stream aborts the storage write, which discards its temp file.
 */
function createInspector(input: { maxBytes: number; filename: string }) {
  const hash = createHash("sha256");
  let size = 0;
  let head = Buffer.alloc(0);
  let mediaType: string | undefined;
  const transform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > input.maxBytes) {
        callback(
          new ApiError(
            413,
            "PAYLOAD_TOO_LARGE",
            `Files larger than ${input.maxBytes} bytes are not accepted.`,
          ),
        );
        return;
      }
      if (head.length < SNIFF_LENGTH) {
        head = Buffer.concat([head, chunk]).subarray(0, SNIFF_LENGTH);
        if (head.length >= SNIFF_LENGTH || size === head.length) {
          mediaType = detectMediaType(head, input.filename);
          if (head.length >= SNIFF_LENGTH && !mediaType) {
            callback(unsupportedMediaType());
            return;
          }
        }
      }
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      if (size === 0) {
        callback(new ApiError(400, "EMPTY_FILE", "The file is empty."));
        return;
      }
      mediaType ??= detectMediaType(head, input.filename);
      if (!mediaType) {
        callback(unsupportedMediaType());
        return;
      }
      callback();
    },
  });
  return {
    transform,
    result: () => ({
      size,
      sha256: hash.digest("hex"),
      mediaType: mediaType!,
    }),
  };
}

function unsupportedMediaType() {
  return new ApiError(
    415,
    "UNSUPPORTED_MEDIA_TYPE",
    "This file type is not accepted. Upload a PDF, Office document, image, text or Final Draft file.",
  );
}

/**
 * Files use-cases. Object storage and PostgreSQL are not one transaction, so
 * the order is deliberate:
 *
 *   upload : stream bytes to storage under a fresh random key → insert the
 *            `staged` row. If the insert fails, the object is deleted
 *            (compensation) and the failure logged with the key. A row can
 *            therefore never point at bytes that were not fully written.
 *   claim  : a document command flips `staged` → `available` inside its own
 *            transaction; only available files back documents.
 *   sweep  : staged rows older than the TTL are retired: row moved to
 *            `deleted` by compare-and-set first, then the object deleted
 *            (missing is fine) only for rows that transition succeeded on.
 *   delete : documents are soft-deleted and bytes retained; there is no
 *            user-facing byte deletion in this milestone.
 */
export function createFileService(deps: {
  db: Database;
  storage: FileStorage;
  maxUploadBytes: number;
}) {
  const { db, storage, maxUploadBytes } = deps;

  return {
    async stageUpload(
      input: {
        source: Readable;
        declaredFilename: string | undefined;
        declaredLength: number | undefined;
      },
      actor: FileActor,
    ): Promise<FileObject> {
      if (
        input.declaredLength !== undefined &&
        input.declaredLength > maxUploadBytes
      ) {
        throw new ApiError(
          413,
          "PAYLOAD_TOO_LARGE",
          `Files larger than ${maxUploadBytes} bytes are not accepted.`,
        );
      }
      const filename = sanitiseFilename(input.declaredFilename);
      const inspector = createInspector({ maxBytes: maxUploadBytes, filename });
      const key = generateStorageKey();
      const sink = new PassThrough();
      // The adapter consumes `sink`; the pipeline drives source → inspector → sink
      // and surfaces inspection errors before the adapter finishes.
      const write = storage.put(key, sink);
      try {
        await Promise.all([
          pipeline(input.source, inspector.transform, sink),
          write,
        ]);
      } catch (error) {
        await write.catch(() => undefined);
        await storage.delete(key).catch(() => undefined);
        throw error;
      }
      const inspected = inspector.result();

      try {
        const row = await fileRepository.insertStaged(db, {
          storageKey: key,
          originalFilename: filename,
          mediaType: inspected.mediaType,
          byteSize: inspected.size,
          sha256: inspected.sha256,
          createdByUserId: actor.userId,
        });
        return toFileObjectContract(row);
      } catch (error) {
        // Compensation: bytes without a row are unreachable; remove them.
        await storage.delete(key).catch((cleanupError: unknown) => {
          log("error", "files.orphan_object", {
            requestId: actor.requestId,
            storageKey: key,
            message:
              cleanupError instanceof Error
                ? cleanupError.message
                : "Unknown error",
          });
        });
        throw error;
      }
    },

    /**
     * Available files are readable by every active user (the deployment is
     * one studio). A staged file is visible only to its uploader until a
     * document claims it. Deleted files do not exist.
     */
    async openForRead(
      fileId: string,
      actor: FileActor,
    ): Promise<{ file: FileObjectRow; stream: Readable }> {
      const file = await fileRepository.findById(db, fileId);
      if (!file || file.status === "deleted")
        throw new ApiError(404, "FILE_NOT_FOUND", "The file was not found.");
      if (
        file.status === "staged" &&
        file.createdByUserId !== actor.userId &&
        actor.role !== "studio_admin"
      )
        throw new ApiError(404, "FILE_NOT_FOUND", "The file was not found.");
      try {
        return { file, stream: await storage.open(file.storageKey) };
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          log("error", "files.object_missing", {
            requestId: actor.requestId,
            fileId,
          });
          throw new ApiError(
            502,
            "FILE_UNAVAILABLE",
            "The file's bytes are not available. An operator has been notified.",
          );
        }
        throw error;
      }
    },

    /**
     * Retires staged uploads nobody claimed. Safe to run at any time, and
     * concurrently with document commands claiming the same files.
     *
     * Order is the invariant: the row is first moved staged → deleted by a
     * compare-and-set that still requires `staged` and the age cutoff, and
     * only a row this sweep actually retired has its bytes removed. A file a
     * document claimed in the meantime no longer matches, so its bytes are
     * never touched. If the byte removal then fails, the row stays `deleted`
     * (nothing can claim or read it) and the orphaned object is logged with
     * its key for a later retry: a stray object is recoverable, a live
     * document without bytes is not.
     */
    async sweepStagedUploads(input: { now?: Date; limit?: number } = {}) {
      const now = input.now ?? new Date();
      const cutoff = new Date(now.getTime() - STAGED_UPLOAD_TTL_MS);
      const candidates = await fileRepository.listStagedOlderThan(
        db,
        cutoff,
        input.limit ?? 100,
      );
      let retired = 0;
      for (const candidate of candidates) {
        const row = await fileRepository.retireStaged(db, {
          id: candidate.id,
          cutoff,
          deletedAt: now,
        });
        if (!row) continue;
        retired += 1;
        await storage.delete(row.storageKey).catch((error: unknown) => {
          log("error", "files.orphan_object", {
            fileId: row.id,
            storageKey: row.storageKey,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        });
      }
      if (retired)
        log("info", "files.staged_uploads_swept", { count: retired });
      return retired;
    },
  };
}

export type FileService = ReturnType<typeof createFileService>;

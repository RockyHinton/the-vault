import type {
  AddScriptVersionInput,
  CreateScriptAnnotationInput,
  CreateScriptInput,
  Document,
  Script,
  ScriptAnnotation,
  ScriptDetail,
  UpdateScriptAnnotationInput,
} from "@shared/contracts";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import {
  documentRepository,
  type DocumentRecord,
} from "../documents/document-repository";
import {
  addDocumentVersionInTransaction,
  createDocumentInTransaction,
  requireClaimableStagedFile,
  toDocumentContract,
} from "../documents/document-service";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import {
  scriptAnnotationRepository,
  scriptRepository,
  type AnnotationEditableFields,
  type AnnotationRecord,
  type ScriptRecord,
} from "./script-repository";

export interface ScriptActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

/** Screenplays live in the workspace's Script folder of the Documents library. */
const SCRIPT_FOLDER = "script" as const;

/**
 * The formats the script reader can present. PDF only today; Final Draft or
 * Office screenplays would be added here together with a reader for them.
 * This is a Scripts rule: the Files domain keeps accepting every allowed type.
 */
const SUPPORTED_SCRIPT_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
]);

/**
 * Refuses a staged upload whose server-detected media type the reader cannot
 * present. Uses the type the Files domain sniffed from the bytes, never the
 * filename or the browser's claim. Missing or already-claimed files are left
 * to the Documents primitive, which answers for them.
 */
async function assertReadableScriptFile(
  tx: Transaction,
  fileObjectId: string,
  actor: ScriptActor,
): Promise<void> {
  // Ownership first: a file id must not reveal another user's upload, so the
  // Documents claimability answer comes before any format answer.
  const file = await requireClaimableStagedFile(tx, fileObjectId, actor);
  if (!SUPPORTED_SCRIPT_MEDIA_TYPES.has(file.mediaType)) {
    throw new ApiError(
      422,
      "SCRIPT_FORMAT_UNSUPPORTED",
      `Screenplays must be uploaded as PDF; this file is ${file.mediaType}.`,
      {
        mediaType: file.mediaType,
        supported: Array.from(SUPPORTED_SCRIPT_MEDIA_TYPES),
      },
    );
  }
}

function toScriptContract(
  record: ScriptRecord,
  currentVersion: Document,
  versionCount: number,
): Script {
  const { script, createdBy } = record;
  return {
    id: script.id,
    projectId: script.projectId,
    documentLineageId: script.documentLineageId,
    title: currentVersion.title,
    currentVersion,
    versionCount,
    createdBy: toUserRef(createdBy),
    createdAt: script.createdAt.toISOString(),
    updatedAt: script.updatedAt.toISOString(),
  };
}

function toAnnotationContract(record: AnnotationRecord): ScriptAnnotation {
  const { annotation, author } = record;
  return {
    id: annotation.id,
    scriptId: annotation.scriptId,
    documentId: annotation.documentId,
    author: toUserRef(author),
    pageNumber: annotation.pageNumber,
    x: Number(annotation.positionX),
    y: Number(annotation.positionY),
    type: annotation.noteType,
    tag: annotation.tag,
    body: annotation.body,
    version: annotation.version,
    createdAt: annotation.createdAt.toISOString(),
    updatedAt: annotation.updatedAt.toISOString(),
  };
}

function requireScript(record: ScriptRecord | undefined): ScriptRecord {
  if (!record)
    throw new ApiError(404, "SCRIPT_NOT_FOUND", "The script was not found.");
  return record;
}

function requireAnnotation(
  record: AnnotationRecord | undefined,
): AnnotationRecord {
  if (!record)
    throw new ApiError(
      404,
      "ANNOTATION_NOT_FOUND",
      "The annotation was not found.",
    );
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This changed while you were editing. Refresh and try again.",
    );
  return row;
}

/** Removing a script follows the authored-record rule; uploads and annotations are collaborative. */
function assertCanRemoveScript(actor: ScriptActor, record: ScriptRecord): void {
  if (actor.role === "studio_admin") return;
  if (record.script.createdByUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the user who added this script or a studio administrator can remove it.",
  );
}

function assertCanManageAnnotation(
  actor: ScriptActor,
  record: AnnotationRecord,
): void {
  if (actor.role === "studio_admin") return;
  if (record.annotation.authorUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the note's author or a studio administrator can change it.",
  );
}

async function requireProject(
  executor: Transaction | Database,
  projectId: string,
) {
  const project = await projectRepository.findById(executor, projectId);
  if (!project)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
}

/** Percentages are stored with two decimals; the contract already bounds them. */
const percent = (value: number) => value.toFixed(2);

/**
 * Scripts use-cases. A script is the stable identity over one Document
 * lineage: creating one creates version 1 through the Documents domain,
 * adding a version adds to that lineage, and reads resolve the lineage's
 * live versions. Annotations bind to one exact version and are validated
 * against the script's lineage so a note can never drift across versions.
 */
export function createScriptService({ db }: { db: Database }) {
  /** Live versions of the lineage, oldest first; empty if the lineage was deleted. */
  const lineageVersions = (
    executor: Transaction | Database,
    lineageId: string,
  ) => documentRepository.listLineage(executor, lineageId);

  async function resolve(
    executor: Transaction | Database,
    record: ScriptRecord,
  ): Promise<ScriptDetail | undefined> {
    const versions = await lineageVersions(
      executor,
      record.script.documentLineageId,
    );
    const current = versions.find((v) => v.document.isCurrent);
    if (!current) return undefined;
    return {
      script: toScriptContract(
        record,
        toDocumentContract(current),
        versions.length,
      ),
      versions: versions.map(toDocumentContract),
    };
  }

  async function loadDetail(
    executor: Transaction | Database,
    projectId: string,
    scriptId: string,
  ): Promise<ScriptDetail> {
    const record = requireScript(
      await scriptRepository.findById(executor, { projectId, scriptId }),
    );
    const detail = await resolve(executor, record);
    if (!detail)
      throw new ApiError(
        404,
        "SCRIPT_NOT_FOUND",
        "The script's documents were deleted from the library.",
      );
    return detail;
  }

  /** The exact version must be a live document of this script's lineage and project. */
  async function requireVersionOfScript(
    executor: Transaction | Database,
    record: ScriptRecord,
    documentId: string,
  ): Promise<DocumentRecord> {
    const document = await documentRepository.findById(executor, {
      projectId: record.script.projectId,
      documentId,
    });
    if (
      !document ||
      document.document.lineageId !== record.script.documentLineageId
    ) {
      throw new ApiError(
        404,
        "SCRIPT_VERSION_NOT_FOUND",
        "That document is not a version of this script.",
      );
    }
    return document;
  }

  return {
    /** Scripts whose lineage still has a live current version, newest first. */
    async list(projectId: string): Promise<Script[]> {
      await requireProject(db, projectId);
      const records = await scriptRepository.listByProject(db, projectId);
      const resolved = await Promise.all(
        records.map((record) => resolve(db, record)),
      );
      return resolved.flatMap((detail) => (detail ? [detail.script] : []));
    },

    async get(projectId: string, scriptId: string): Promise<ScriptDetail> {
      await requireProject(db, projectId);
      return loadDetail(db, projectId, scriptId);
    },

    /** Upload-as-script: version 1 is born through the Documents domain, then the script is recorded. */
    async create(
      projectId: string,
      input: CreateScriptInput,
      actor: ScriptActor,
    ): Promise<ScriptDetail> {
      const scriptId = await withTransaction(db, async (tx) => {
        await requireProject(tx, projectId);
        await assertReadableScriptFile(tx, input.fileObjectId, actor);
        const document = await createDocumentInTransaction(tx, {
          projectId,
          document: {
            fileObjectId: input.fileObjectId,
            folder: SCRIPT_FOLDER,
            title: input.title,
            status: "draft",
            notes: input.notes,
          },
          actor,
        });
        const created = await scriptRepository.insert(tx, {
          projectId,
          documentLineageId: document.lineageId,
          createdByUserId: actor.userId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "script.created",
          entityType: "script",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            documentLineageId: document.lineageId,
            documentId: document.id,
            sha256: document.file.sha256,
          },
        });
        return created.id;
      });
      return loadDetail(db, projectId, scriptId);
    },

    /** A new screenplay draft: version N+1 in the same lineage; nothing earlier changes. */
    async addVersion(
      projectId: string,
      scriptId: string,
      input: AddScriptVersionInput,
      actor: ScriptActor,
    ): Promise<ScriptDetail> {
      await withTransaction(db, async (tx) => {
        const record = requireScript(
          await scriptRepository.findById(tx, { projectId, scriptId }),
        );
        const versions = await lineageVersions(
          tx,
          record.script.documentLineageId,
        );
        const current = versions.find((v) => v.document.isCurrent);
        if (!current)
          throw new ApiError(
            404,
            "SCRIPT_NOT_FOUND",
            "The script's documents were deleted from the library.",
          );
        await assertReadableScriptFile(tx, input.fileObjectId, actor);
        const next = await addDocumentVersionInTransaction(tx, {
          projectId,
          documentId: current.document.id,
          version: {
            fileObjectId: input.fileObjectId,
            status: "draft",
            notes: input.notes,
            version: input.currentDocumentVersion,
          },
          actor,
        });
        await scriptRepository.touch(tx, scriptId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "script.version_added",
          entityType: "script",
          entityId: scriptId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            documentId: next.id,
            versionNumber: next.versionNumber,
            previousDocumentId: current.document.id,
            sha256: next.file.sha256,
          },
        });
      });
      return loadDetail(db, projectId, scriptId);
    },

    /** Soft-deletes the script identity; the lineage, its bytes and its annotations' provenance stay. */
    async delete(
      projectId: string,
      scriptId: string,
      actor: ScriptActor,
    ): Promise<void> {
      await withTransaction(db, async (tx) => {
        const record = requireScript(
          await scriptRepository.findById(tx, { projectId, scriptId }),
        );
        assertCanRemoveScript(actor, record);
        // The `deleted_at IS NULL` predicate is the concurrency contract: a
        // script has no mutable field, so a concurrent or repeated removal
        // updates zero rows and must not append a second `script.deleted`.
        if (
          !(await scriptRepository.softDelete(tx, {
            id: scriptId,
            deletedAt: new Date(),
          }))
        )
          throw new ApiError(
            409,
            "VERSION_CONFLICT",
            "The script was already removed. Refresh and try again.",
          );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "script.deleted",
          entityType: "script",
          entityId: scriptId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            documentLineageId: record.script.documentLineageId,
          },
        });
      });
    },

    async listAnnotations(
      projectId: string,
      scriptId: string,
      documentId: string,
    ): Promise<ScriptAnnotation[]> {
      const record = requireScript(
        await scriptRepository.findById(db, { projectId, scriptId }),
      );
      await requireVersionOfScript(db, record, documentId);
      const rows = await scriptAnnotationRepository.listByDocument(db, {
        scriptId,
        documentId,
      });
      return rows.map(toAnnotationContract);
    },

    async createAnnotation(
      projectId: string,
      scriptId: string,
      documentId: string,
      input: CreateScriptAnnotationInput,
      actor: ScriptActor,
    ): Promise<ScriptAnnotation> {
      const id = await withTransaction(db, async (tx) => {
        const record = requireScript(
          await scriptRepository.findById(tx, { projectId, scriptId }),
        );
        const version = await requireVersionOfScript(tx, record, documentId);
        const created = await scriptAnnotationRepository.insert(tx, {
          scriptId,
          documentId: version.document.id,
          authorUserId: actor.userId,
          pageNumber: input.pageNumber,
          positionX: percent(input.x),
          positionY: percent(input.y),
          noteType: input.type,
          tag: input.tag,
          body: input.body,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "script_annotation.created",
          entityType: "script_annotation",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            scriptId,
            documentId: version.document.id,
            versionNumber: version.document.versionNumber,
            pageNumber: input.pageNumber,
            type: input.type,
          },
        });
        return created.id;
      });
      return toAnnotationContract(
        requireAnnotation(
          await scriptAnnotationRepository.findById(db, {
            scriptId,
            annotationId: id,
          }),
        ),
      );
    },

    async updateAnnotation(
      projectId: string,
      scriptId: string,
      annotationId: string,
      input: UpdateScriptAnnotationInput,
      actor: ScriptActor,
    ): Promise<ScriptAnnotation> {
      const values: AnnotationEditableFields = {
        noteType: input.type,
        tag: input.tag,
        body: input.body,
      };
      const changedFields = (
        Object.keys(values) as (keyof AnnotationEditableFields)[]
      ).filter((key) => values[key] !== undefined);
      await withTransaction(db, async (tx) => {
        requireScript(
          await scriptRepository.findById(tx, { projectId, scriptId }),
        );
        const existing = requireAnnotation(
          await scriptAnnotationRepository.findById(tx, {
            scriptId,
            annotationId,
          }),
        );
        assertCanManageAnnotation(actor, existing);
        requireFresh(
          await scriptAnnotationRepository.updateFields(tx, {
            id: annotationId,
            expectedVersion: input.version,
            values,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "script_annotation.updated",
          entityType: "script_annotation",
          entityId: annotationId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            scriptId,
            documentId: existing.annotation.documentId,
            changedFields,
          },
        });
      });
      return toAnnotationContract(
        requireAnnotation(
          await scriptAnnotationRepository.findById(db, {
            scriptId,
            annotationId,
          }),
        ),
      );
    },

    async deleteAnnotation(
      projectId: string,
      scriptId: string,
      annotationId: string,
      version: number,
      actor: ScriptActor,
    ): Promise<void> {
      await withTransaction(db, async (tx) => {
        requireScript(
          await scriptRepository.findById(tx, { projectId, scriptId }),
        );
        const existing = requireAnnotation(
          await scriptAnnotationRepository.findById(tx, {
            scriptId,
            annotationId,
          }),
        );
        assertCanManageAnnotation(actor, existing);
        requireFresh(
          await scriptAnnotationRepository.softDelete(tx, {
            id: annotationId,
            expectedVersion: version,
            deletedAt: new Date(),
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "script_annotation.deleted",
          entityType: "script_annotation",
          entityId: annotationId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            scriptId,
            documentId: existing.annotation.documentId,
            authorUserId: existing.annotation.authorUserId,
          },
        });
      });
    },
  };
}

export type ScriptService = ReturnType<typeof createScriptService>;

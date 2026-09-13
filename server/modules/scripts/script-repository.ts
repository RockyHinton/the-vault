import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  applicationUsers,
  scriptAnnotations,
  scripts,
  type ScriptAnnotationRow,
  type ScriptRow,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import type { UserRefColumns } from "../users/user-ref";

export interface ScriptRecord {
  script: ScriptRow;
  createdBy: UserRefColumns;
}

export interface AnnotationRecord {
  annotation: ScriptAnnotationRow;
  author: UserRefColumns;
}

/** Only what an annotation edit may change; position and version binding are immutable. */
export type AnnotationEditableFields = Partial<
  Pick<ScriptAnnotationRow, "noteType" | "tag" | "body">
>;

const userRefColumns = {
  id: applicationUsers.id,
  displayName: applicationUsers.displayName,
  email: applicationUsers.email,
};

function scriptsBase(executor: DatabaseExecutor) {
  return executor
    .select({ script: scripts, createdBy: userRefColumns })
    .from(scripts)
    .innerJoin(
      applicationUsers,
      eq(scripts.createdByUserId, applicationUsers.id),
    );
}

/** Persistence for `scripts`. Project scoping is part of every lookup. */
export const scriptRepository = {
  async listByProject(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<ScriptRecord[]> {
    return scriptsBase(executor)
      .where(and(eq(scripts.projectId, projectId), isNull(scripts.deletedAt)))
      .orderBy(desc(scripts.createdAt), desc(scripts.id));
  },

  async findById(
    executor: DatabaseExecutor,
    input: { projectId: string; scriptId: string },
  ): Promise<ScriptRecord | undefined> {
    const [row] = await scriptsBase(executor)
      .where(
        and(
          eq(scripts.id, input.scriptId),
          eq(scripts.projectId, input.projectId),
          isNull(scripts.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      projectId: string;
      documentLineageId: string;
      createdByUserId: string;
    },
  ): Promise<ScriptRow> {
    const [row] = await tx.insert(scripts).values(input).returning();
    return row;
  },

  /** Marks the lineage as touched so `updatedAt` reflects the latest version. */
  async touch(tx: Transaction, id: string): Promise<void> {
    await tx
      .update(scripts)
      .set({ updatedAt: new Date() })
      .where(eq(scripts.id, id));
  },

  /** The live script, if any, whose identity is this document lineage (any project). */
  async findLiveByLineage(
    executor: DatabaseExecutor,
    documentLineageId: string,
  ): Promise<ScriptRow | undefined> {
    const [row] = await executor
      .select()
      .from(scripts)
      .where(
        and(
          eq(scripts.documentLineageId, documentLineageId),
          isNull(scripts.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  async softDelete(
    tx: Transaction,
    input: { id: string; deletedAt: Date },
  ): Promise<ScriptRow | undefined> {
    const [row] = await tx
      .update(scripts)
      .set({ deletedAt: input.deletedAt, updatedAt: input.deletedAt })
      .where(and(eq(scripts.id, input.id), isNull(scripts.deletedAt)))
      .returning();
    return row;
  },
};

function annotationsBase(executor: DatabaseExecutor) {
  return executor
    .select({ annotation: scriptAnnotations, author: userRefColumns })
    .from(scriptAnnotations)
    .innerJoin(
      applicationUsers,
      eq(scriptAnnotations.authorUserId, applicationUsers.id),
    );
}

async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: AnnotationEditableFields &
      Partial<Pick<ScriptAnnotationRow, "deletedAt">>;
  },
): Promise<ScriptAnnotationRow | undefined> {
  const [row] = await tx
    .update(scriptAnnotations)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scriptAnnotations.id, input.id),
        eq(scriptAnnotations.version, input.expectedVersion),
        isNull(scriptAnnotations.deletedAt),
      ),
    )
    .returning();
  return row;
}

/** Persistence for `script_annotations`; every read is bound to one exact document version. */
export const scriptAnnotationRepository = {
  /** Live notes on one exact version: page, then creation order. */
  async listByDocument(
    executor: DatabaseExecutor,
    input: { scriptId: string; documentId: string },
  ): Promise<AnnotationRecord[]> {
    return annotationsBase(executor)
      .where(
        and(
          eq(scriptAnnotations.scriptId, input.scriptId),
          eq(scriptAnnotations.documentId, input.documentId),
          isNull(scriptAnnotations.deletedAt),
        ),
      )
      .orderBy(
        asc(scriptAnnotations.pageNumber),
        asc(scriptAnnotations.createdAt),
        asc(scriptAnnotations.id),
      );
  },

  async findById(
    executor: DatabaseExecutor,
    input: { scriptId: string; annotationId: string },
  ): Promise<AnnotationRecord | undefined> {
    const [row] = await annotationsBase(executor)
      .where(
        and(
          eq(scriptAnnotations.id, input.annotationId),
          eq(scriptAnnotations.scriptId, input.scriptId),
          isNull(scriptAnnotations.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      scriptId: string;
      documentId: string;
      authorUserId: string;
      pageNumber: number;
      positionX: string;
      positionY: string;
      noteType: ScriptAnnotationRow["noteType"];
      tag: ScriptAnnotationRow["tag"];
      body: string;
    },
  ): Promise<ScriptAnnotationRow> {
    const [row] = await tx.insert(scriptAnnotations).values(input).returning();
    return row;
  },

  updateFields(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      values: AnnotationEditableFields;
    },
  ): Promise<ScriptAnnotationRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: input.values,
    });
  },

  softDelete(
    tx: Transaction,
    input: { id: string; expectedVersion: number; deletedAt: Date },
  ): Promise<ScriptAnnotationRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { deletedAt: input.deletedAt },
    });
  },
};

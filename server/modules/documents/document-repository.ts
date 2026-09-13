import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  applicationUsers,
  documents,
  fileObjects,
  type DocumentRow,
  type FileObjectRow,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";

export interface DocumentRecord {
  document: DocumentRow;
  file: FileObjectRow;
  createdBy: { id: string; displayName: string | null; email: string };
}

/** Only the metadata a user edit may touch. */
export type DocumentEditableFields = Partial<
  Pick<DocumentRow, "title" | "folder" | "status" | "notes">
>;

const selection = {
  document: documents,
  file: fileObjects,
  createdBy: {
    id: applicationUsers.id,
    displayName: applicationUsers.displayName,
    email: applicationUsers.email,
  },
};

function base(executor: DatabaseExecutor) {
  return executor
    .select(selection)
    .from(documents)
    .innerJoin(fileObjects, eq(documents.fileObjectId, fileObjects.id))
    .innerJoin(
      applicationUsers,
      eq(documents.createdByUserId, applicationUsers.id),
    );
}

/** Compare-and-set on id + expected version; undefined means stale. */
async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: DocumentEditableFields &
      Partial<Pick<DocumentRow, "isCurrent" | "deletedAt">>;
  },
): Promise<DocumentRow | undefined> {
  const [row] = await tx
    .update(documents)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.id, input.id),
        eq(documents.version, input.expectedVersion),
        isNull(documents.deletedAt),
      ),
    )
    .returning();
  return row;
}

/** Persistence for `documents`. No policy, no transactions. */
export const documentRepository = {
  /** Current, live versions for a project, newest first. */
  async listCurrent(
    executor: DatabaseExecutor,
    input: { projectId: string; folder?: string },
  ): Promise<DocumentRecord[]> {
    const filters = [
      eq(documents.projectId, input.projectId),
      eq(documents.isCurrent, true),
      isNull(documents.deletedAt),
    ];
    if (input.folder) filters.push(eq(documents.folder, input.folder));
    return base(executor)
      .where(and(...filters))
      .orderBy(desc(documents.createdAt), desc(documents.id));
  },

  async findById(
    executor: DatabaseExecutor,
    input: { projectId: string; documentId: string },
  ): Promise<DocumentRecord | undefined> {
    const [row] = await base(executor)
      .where(
        and(
          eq(documents.id, input.documentId),
          eq(documents.projectId, input.projectId),
          isNull(documents.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  /** The live current version of each listed lineage, within one project. */
  async listCurrentByLineages(
    executor: DatabaseExecutor,
    input: { projectId: string; lineageIds: string[] },
  ): Promise<DocumentRecord[]> {
    if (input.lineageIds.length === 0) return [];
    return base(executor)
      .where(
        and(
          eq(documents.projectId, input.projectId),
          inArray(documents.lineageId, input.lineageIds),
          eq(documents.isCurrent, true),
          isNull(documents.deletedAt),
        ),
      )
      .orderBy(desc(documents.createdAt), desc(documents.id));
  },

  /** Every live version of a lineage, oldest first. */
  async listLineage(
    executor: DatabaseExecutor,
    lineageId: string,
  ): Promise<DocumentRecord[]> {
    return base(executor)
      .where(
        and(eq(documents.lineageId, lineageId), isNull(documents.deletedAt)),
      )
      .orderBy(asc(documents.versionNumber));
  },

  async insert(
    tx: Transaction,
    input: {
      id?: string;
      projectId: string;
      lineageId: string;
      versionNumber: number;
      fileObjectId: string;
      folder: string;
      title: string;
      status: DocumentRow["status"];
      notes: string | null;
      createdByUserId: string;
    },
  ): Promise<DocumentRow> {
    const [row] = await tx
      .insert(documents)
      .values({ ...input, isCurrent: true })
      .returning();
    return row;
  },

  updateFields(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      values: DocumentEditableFields;
    },
  ): Promise<DocumentRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: input.values,
    });
  },

  /** Retires the current version so a newer one can take its place. */
  retireCurrent(
    tx: Transaction,
    input: { id: string; expectedVersion: number },
  ): Promise<DocumentRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { isCurrent: false },
    });
  },

  softDeleteCurrent(
    tx: Transaction,
    input: { id: string; expectedVersion: number; deletedAt: Date },
  ): Promise<DocumentRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { deletedAt: input.deletedAt },
    });
  },

  /** Soft-deletes every other live version of the lineage; returns the count. */
  async softDeleteLineage(
    tx: Transaction,
    input: { lineageId: string; deletedAt: Date },
  ): Promise<number> {
    const rows = await tx
      .update(documents)
      .set({ deletedAt: input.deletedAt, updatedAt: input.deletedAt })
      .where(
        and(
          eq(documents.lineageId, input.lineageId),
          isNull(documents.deletedAt),
        ),
      )
      .returning({ id: documents.id });
    return rows.length;
  },
};

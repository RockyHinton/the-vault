import { and, desc, eq, isNull } from "drizzle-orm";
import {
  applicationUsers,
  legalRecordDocuments,
  legalRecords,
  type LegalRecordRow,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import { createAttachmentRepository } from "../documents/document-attachments";
import type { UserRefColumns } from "../users/user-ref";

export interface LegalRecordRecord {
  record: LegalRecordRow;
  createdBy: UserRefColumns;
}

/** Only what an edit may change; category is immutable. */
export type LegalRecordEditableFields = Partial<
  Pick<LegalRecordRow, "name" | "notes" | "details">
>;

const selection = {
  record: legalRecords,
  createdBy: {
    id: applicationUsers.id,
    displayName: applicationUsers.displayName,
    email: applicationUsers.email,
  },
};

function base(executor: DatabaseExecutor) {
  return executor
    .select(selection)
    .from(legalRecords)
    .innerJoin(
      applicationUsers,
      eq(legalRecords.createdByUserId, applicationUsers.id),
    );
}

async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: LegalRecordEditableFields & Partial<Pick<LegalRecordRow, "deletedAt">>;
  },
): Promise<LegalRecordRow | undefined> {
  const [row] = await tx
    .update(legalRecords)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(legalRecords.id, input.id),
        eq(legalRecords.version, input.expectedVersion),
        isNull(legalRecords.deletedAt),
      ),
    )
    .returning();
  return row;
}

/** Persistence for `legal_records`. Project scoping is part of every lookup. */
export const legalRecordRepository = {
  async listByProject(
    executor: DatabaseExecutor,
    input: { projectId: string; category?: LegalRecordRow["category"] },
  ): Promise<LegalRecordRecord[]> {
    const filters = [
      eq(legalRecords.projectId, input.projectId),
      isNull(legalRecords.deletedAt),
    ];
    if (input.category) filters.push(eq(legalRecords.category, input.category));
    return base(executor)
      .where(and(...filters))
      .orderBy(desc(legalRecords.createdAt), desc(legalRecords.id));
  },

  async findById(
    executor: DatabaseExecutor,
    input: { projectId: string; recordId: string },
  ): Promise<LegalRecordRecord | undefined> {
    const [row] = await base(executor)
      .where(
        and(
          eq(legalRecords.id, input.recordId),
          eq(legalRecords.projectId, input.projectId),
          isNull(legalRecords.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      projectId: string;
      category: LegalRecordRow["category"];
      name: string;
      notes: string | null;
      details: LegalRecordRow["details"];
      createdByUserId: string;
    },
  ): Promise<LegalRecordRow> {
    const [row] = await tx.insert(legalRecords).values(input).returning();
    return row;
  },

  updateFields(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      values: LegalRecordEditableFields;
    },
  ): Promise<LegalRecordRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: input.values,
    });
  },

  softDelete(
    tx: Transaction,
    input: { id: string; expectedVersion: number; deletedAt: Date },
  ): Promise<LegalRecordRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { deletedAt: input.deletedAt },
    });
  },
};

/** Persistence for the legal-record→document lineage join (shared owner pattern). */
export const legalRecordDocumentRepository = createAttachmentRepository({
  table: legalRecordDocuments,
  ownerColumn: legalRecordDocuments.legalRecordId,
  ownerKey: "legalRecordId",
});

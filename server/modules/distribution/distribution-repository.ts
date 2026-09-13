import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  applicationUsers,
  distributionTerritories,
  distributionTerritoryDocuments,
  distributionTerritoryNotes,
  type DistributionTerritoryNoteRow,
  type DistributionTerritoryRow,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import { createAttachmentRepository } from "../documents/document-attachments";
import type { UserRefColumns } from "../users/user-ref";

export interface TerritoryRecord {
  territory: DistributionTerritoryRow;
  createdBy: UserRefColumns;
}

export interface TerritoryNoteRecord {
  note: DistributionTerritoryNoteRow;
  author: UserRefColumns;
}

/** Only what a collaborative edit may change; status and deletion are commands. */
export type TerritoryEditableFields = Partial<
  Pick<
    DistributionTerritoryRow,
    | "name"
    | "distributor"
    | "contact"
    | "signaturePayment"
    | "deliveryPayment"
    | "generalNotes"
  >
>;

const userColumns = {
  id: applicationUsers.id,
  displayName: applicationUsers.displayName,
  email: applicationUsers.email,
};

function territoriesBase(executor: DatabaseExecutor) {
  return executor
    .select({ territory: distributionTerritories, createdBy: userColumns })
    .from(distributionTerritories)
    .innerJoin(
      applicationUsers,
      eq(distributionTerritories.createdByUserId, applicationUsers.id),
    );
}

async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: TerritoryEditableFields &
      Partial<Pick<DistributionTerritoryRow, "status" | "deletedAt">>;
  },
): Promise<DistributionTerritoryRow | undefined> {
  const [row] = await tx
    .update(distributionTerritories)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(distributionTerritories.id, input.id),
        eq(distributionTerritories.version, input.expectedVersion),
        isNull(distributionTerritories.deletedAt),
      ),
    )
    .returning();
  return row;
}

/** Persistence for `distribution_territories`. Project scoping is part of every lookup. */
export const territoryRepository = {
  async listByProject(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<TerritoryRecord[]> {
    return territoriesBase(executor)
      .where(
        and(
          eq(distributionTerritories.projectId, projectId),
          isNull(distributionTerritories.deletedAt),
        ),
      )
      .orderBy(
        asc(distributionTerritories.createdAt),
        asc(distributionTerritories.id),
      );
  },

  async findById(
    executor: DatabaseExecutor,
    input: { projectId: string; territoryId: string },
  ): Promise<TerritoryRecord | undefined> {
    const [row] = await territoriesBase(executor)
      .where(
        and(
          eq(distributionTerritories.id, input.territoryId),
          eq(distributionTerritories.projectId, input.projectId),
          isNull(distributionTerritories.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  /** Live territory with the same name in the project, ignoring case (the unique index's rule). */
  async findByName(
    executor: DatabaseExecutor,
    input: { projectId: string; name: string },
  ): Promise<DistributionTerritoryRow | undefined> {
    const [row] = await executor
      .select()
      .from(distributionTerritories)
      .where(
        and(
          eq(distributionTerritories.projectId, input.projectId),
          sql`lower(${distributionTerritories.name}) = lower(${input.name})`,
          isNull(distributionTerritories.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  /** Live note and attachment counts for the grid, one query each. */
  async countsByProject(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<Map<string, { notes: number; documents: number }>> {
    const [notes, documents] = await Promise.all([
      executor
        .select({
          territoryId: distributionTerritoryNotes.territoryId,
          count: sql<number>`count(*)::int`,
        })
        .from(distributionTerritoryNotes)
        .innerJoin(
          distributionTerritories,
          eq(
            distributionTerritoryNotes.territoryId,
            distributionTerritories.id,
          ),
        )
        .where(
          and(
            eq(distributionTerritories.projectId, projectId),
            isNull(distributionTerritoryNotes.deletedAt),
          ),
        )
        .groupBy(distributionTerritoryNotes.territoryId),
      executor
        .select({
          territoryId: distributionTerritoryDocuments.territoryId,
          count: sql<number>`count(*)::int`,
        })
        .from(distributionTerritoryDocuments)
        .innerJoin(
          distributionTerritories,
          eq(
            distributionTerritoryDocuments.territoryId,
            distributionTerritories.id,
          ),
        )
        .where(eq(distributionTerritories.projectId, projectId))
        .groupBy(distributionTerritoryDocuments.territoryId),
    ]);
    const counts = new Map<string, { notes: number; documents: number }>();
    const entry = (id: string) => {
      const existing = counts.get(id) ?? { notes: 0, documents: 0 };
      counts.set(id, existing);
      return existing;
    };
    for (const row of notes) entry(row.territoryId).notes = Number(row.count);
    for (const row of documents)
      entry(row.territoryId).documents = Number(row.count);
    return counts;
  },

  async insert(
    tx: Transaction,
    input: { projectId: string; name: string; createdByUserId: string },
  ): Promise<DistributionTerritoryRow> {
    const [row] = await tx
      .insert(distributionTerritories)
      .values(input)
      .returning();
    return row;
  },

  updateFields(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      values: TerritoryEditableFields;
    },
  ): Promise<DistributionTerritoryRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: input.values,
    });
  },

  changeStatus(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      status: DistributionTerritoryRow["status"];
    },
  ): Promise<DistributionTerritoryRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { status: input.status },
    });
  },

  softDelete(
    tx: Transaction,
    input: { id: string; expectedVersion: number; deletedAt: Date },
  ): Promise<DistributionTerritoryRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { deletedAt: input.deletedAt },
    });
  },

  async touch(tx: Transaction, id: string): Promise<void> {
    await tx
      .update(distributionTerritories)
      .set({ updatedAt: new Date() })
      .where(eq(distributionTerritories.id, id));
  },
};

function notesBase(executor: DatabaseExecutor) {
  return executor
    .select({ note: distributionTerritoryNotes, author: userColumns })
    .from(distributionTerritoryNotes)
    .innerJoin(
      applicationUsers,
      eq(distributionTerritoryNotes.authorUserId, applicationUsers.id),
    );
}

/** Persistence for `distribution_territory_notes`, newest first. */
export const territoryNoteRepository = {
  async listByTerritory(
    executor: DatabaseExecutor,
    territoryId: string,
  ): Promise<TerritoryNoteRecord[]> {
    return notesBase(executor)
      .where(
        and(
          eq(distributionTerritoryNotes.territoryId, territoryId),
          isNull(distributionTerritoryNotes.deletedAt),
        ),
      )
      .orderBy(
        desc(distributionTerritoryNotes.createdAt),
        desc(distributionTerritoryNotes.id),
      );
  },

  async findById(
    executor: DatabaseExecutor,
    input: { territoryId: string; noteId: string },
  ): Promise<TerritoryNoteRecord | undefined> {
    const [row] = await notesBase(executor)
      .where(
        and(
          eq(distributionTerritoryNotes.id, input.noteId),
          eq(distributionTerritoryNotes.territoryId, input.territoryId),
          isNull(distributionTerritoryNotes.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: { territoryId: string; authorUserId: string; body: string },
  ): Promise<DistributionTerritoryNoteRow> {
    const [row] = await tx
      .insert(distributionTerritoryNotes)
      .values(input)
      .returning();
    return row;
  },

  async updateBody(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      body: string;
      editedAt: Date;
    },
  ): Promise<DistributionTerritoryNoteRow | undefined> {
    const [row] = await tx
      .update(distributionTerritoryNotes)
      .set({
        body: input.body,
        editedAt: input.editedAt,
        version: input.expectedVersion + 1,
        updatedAt: input.editedAt,
      })
      .where(
        and(
          eq(distributionTerritoryNotes.id, input.id),
          eq(distributionTerritoryNotes.version, input.expectedVersion),
          isNull(distributionTerritoryNotes.deletedAt),
        ),
      )
      .returning();
    return row;
  },

  async softDelete(
    tx: Transaction,
    input: { id: string; expectedVersion: number; deletedAt: Date },
  ): Promise<DistributionTerritoryNoteRow | undefined> {
    const [row] = await tx
      .update(distributionTerritoryNotes)
      .set({
        deletedAt: input.deletedAt,
        version: input.expectedVersion + 1,
        updatedAt: input.deletedAt,
      })
      .where(
        and(
          eq(distributionTerritoryNotes.id, input.id),
          eq(distributionTerritoryNotes.version, input.expectedVersion),
          isNull(distributionTerritoryNotes.deletedAt),
        ),
      )
      .returning();
    return row;
  },
};

/** Persistence for the territory→document lineage join (shared owner pattern). */
export const territoryDocumentRepository = createAttachmentRepository({
  table: distributionTerritoryDocuments,
  ownerColumn: distributionTerritoryDocuments.territoryId,
  ownerKey: "territoryId",
});

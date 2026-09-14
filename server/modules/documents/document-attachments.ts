import { and, asc, eq, inArray } from "drizzle-orm";
import { getTableConfig, type PgColumn } from "drizzle-orm/pg-core";
import type { Document } from "@shared/contracts";
import {
  budgetDepartmentDocuments,
  financeSourceDocuments,
  legalRecordDocuments,
  distributionTerritoryDocuments,
  projectPersonDocuments,
  projectRightDocuments,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import { withUniqueViolationAsConflict } from "../../db/unique-violation";
import { ApiError } from "../../http/errors";
import { toDocumentContract } from "./document-contract";
import { documentRepository } from "./document-repository";

/** The row shape every owner→documents join table shares (see `attachmentColumns` in the schema). */
export interface AttachmentRow {
  ownerId: string;
  documentLineageId: string;
  attachedByUserId: string;
  attachedAt: Date;
}

/**
 * The join tables that follow the owner→documents convention. Listing them
 * here (rather than accepting any table) keeps Drizzle's typing exact and
 * makes adding an owner a deliberate, reviewed change.
 */
type AttachmentJoinTable =
  | typeof distributionTerritoryDocuments
  | typeof projectPersonDocuments
  | typeof projectRightDocuments
  | typeof legalRecordDocuments
  | typeof budgetDepartmentDocuments
  | typeof financeSourceDocuments;
type OwnerKey =
  | "personId"
  | "territoryId"
  | "rightId"
  | "legalRecordId"
  | "budgetDepartmentId"
  | "financeSourceId";

/** The name of a join table's (owner, lineage) primary key constraint. */
export function attachmentPrimaryKeyName(table: AttachmentJoinTable): string {
  const [primaryKey] = getTableConfig(table).primaryKeys;
  if (!primaryKey)
    throw new Error("An attachment join table must have a primary key.");
  return primaryKey.getName();
}

/** The one conflict every owner answers for a lineage that is already linked. */
export const documentAlreadyAttached = () =>
  new ApiError(
    409,
    "DOCUMENT_ALREADY_ATTACHED",
    "That document is already attached.",
  );

/**
 * Persistence for one owner→documents join table. Owners (People, Rights,
 * Legal) each create one with their own table and owner column; policy,
 * audit and folder choice stay in the owning service. This is deliberately
 * the whole of the shared surface: four queries and one loader.
 */
export function createAttachmentRepository(config: {
  table: AttachmentJoinTable;
  ownerColumn: PgColumn;
  /** The TypeScript key of the owner column, e.g. `personId`. */
  ownerKey: OwnerKey;
}) {
  const { table, ownerColumn, ownerKey } = config;
  // The (owner, lineage) primary key, named exactly as the migration created it.
  const primaryKeyName = attachmentPrimaryKeyName(table);
  const columns = {
    ownerId: ownerColumn,
    documentLineageId: table.documentLineageId,
    attachedByUserId: table.attachedByUserId,
    attachedAt: table.attachedAt,
  };
  // The generic column types erase the row shape; the selection above fixes it.
  const asRows = (rows: unknown[]) => rows as AttachmentRow[];

  async function listByOwners(
    executor: DatabaseExecutor,
    ownerIds: string[],
  ): Promise<AttachmentRow[]> {
    if (ownerIds.length === 0) return [];
    return asRows(
      await executor
        .select(columns)
        .from(table)
        .where(inArray(ownerColumn, ownerIds))
        .orderBy(asc(table.attachedAt)),
    );
  }

  return {
    /** Attachment rows for every listed owner, oldest attachment first. */
    listByOwners,

    async find(
      executor: DatabaseExecutor,
      input: { ownerId: string; documentLineageId: string },
    ): Promise<AttachmentRow | undefined> {
      const [row] = asRows(
        await executor
          .select(columns)
          .from(table)
          .where(
            and(
              eq(ownerColumn, input.ownerId),
              eq(table.documentLineageId, input.documentLineageId),
            ),
          )
          .limit(1),
      );
      return row;
    },

    /**
     * Inserts the link. The join table's primary key (owner, lineage) is the
     * uniqueness backstop: owners pre-check with `find` for the ordinary
     * duplicate, and a concurrent duplicate that passed that check too fails
     * here on this table's own key and becomes the same stable
     * `409 DOCUMENT_ALREADY_ATTACHED`. The caller's transaction still aborts,
     * so the loser keeps no link, no other writes and no audit event. Any
     * other database error propagates untouched.
     */
    async insert(
      tx: Transaction,
      input: {
        ownerId: string;
        documentLineageId: string;
        attachedByUserId: string;
      },
    ): Promise<void> {
      // Every owner key is written; Drizzle ignores columns the table lacks
      // only at the type level, so the object carries exactly this table's key.
      const values = {
        [ownerKey]: input.ownerId,
        documentLineageId: input.documentLineageId,
        attachedByUserId: input.attachedByUserId,
      } as {
        personId: string;
        territoryId: string;
        rightId: string;
        legalRecordId: string;
        budgetDepartmentId: string;
        financeSourceId: string;
      } & {
        documentLineageId: string;
        attachedByUserId: string;
      };
      await withUniqueViolationAsConflict(
        primaryKeyName,
        documentAlreadyAttached,
        () => tx.insert(table).values(values),
      );
    },

    /** Returns true when a link was removed. */
    async delete(
      tx: Transaction,
      input: { ownerId: string; documentLineageId: string },
    ): Promise<boolean> {
      const rows = await tx
        .delete(table)
        .where(
          and(
            eq(ownerColumn, input.ownerId),
            eq(table.documentLineageId, input.documentLineageId),
          ),
        )
        .returning({ lineage: table.documentLineageId });
      return rows.length > 0;
    },

    /**
     * Current versions of every attached lineage, grouped by owner, in
     * attachment order; two queries however many owners are listed.
     */
    async loadDocumentsByOwner(
      executor: DatabaseExecutor,
      input: { projectId: string; ownerIds: string[] },
    ): Promise<Map<string, Document[]>> {
      const result = new Map<string, Document[]>(
        input.ownerIds.map((id) => [id, []]),
      );
      const links = await listByOwners(executor, input.ownerIds);
      const records = await documentRepository.listCurrentByLineages(executor, {
        projectId: input.projectId,
        lineageIds: Array.from(
          new Set(links.map((link) => link.documentLineageId)),
        ),
      });
      const byLineage = new Map(
        records.map((record) => [
          record.document.lineageId,
          toDocumentContract(record),
        ]),
      );
      for (const link of links) {
        const document = byLineage.get(link.documentLineageId);
        if (document) result.get(link.ownerId)?.push(document);
      }
      return result;
    },
  };
}

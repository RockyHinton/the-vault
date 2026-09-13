import { and, desc, eq, isNull } from "drizzle-orm";
import {
  applicationUsers,
  projectRightDocuments,
  projectRights,
  type ProjectRightRow,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import { createAttachmentRepository } from "../documents/document-attachments";
import type { UserRefColumns } from "../users/user-ref";

export interface RightRecord {
  right: ProjectRightRow;
  createdBy: UserRefColumns;
}

/** Only what an edit may change; status moves through its own command. */
export type RightEditableFields = Partial<
  Pick<ProjectRightRow, "rightsType" | "rightsHolder" | "expiryDate" | "notes">
>;

const selection = {
  right: projectRights,
  createdBy: {
    id: applicationUsers.id,
    displayName: applicationUsers.displayName,
    email: applicationUsers.email,
  },
};

function base(executor: DatabaseExecutor) {
  return executor
    .select(selection)
    .from(projectRights)
    .innerJoin(
      applicationUsers,
      eq(projectRights.createdByUserId, applicationUsers.id),
    );
}

async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: RightEditableFields &
      Partial<Pick<ProjectRightRow, "status" | "deletedAt">>;
  },
): Promise<ProjectRightRow | undefined> {
  const [row] = await tx
    .update(projectRights)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectRights.id, input.id),
        eq(projectRights.version, input.expectedVersion),
        isNull(projectRights.deletedAt),
      ),
    )
    .returning();
  return row;
}

/** Persistence for `project_rights`. Project scoping is part of every lookup. */
export const rightRepository = {
  async listByProject(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<RightRecord[]> {
    return base(executor)
      .where(
        and(
          eq(projectRights.projectId, projectId),
          isNull(projectRights.deletedAt),
        ),
      )
      .orderBy(desc(projectRights.createdAt), desc(projectRights.id));
  },

  async findById(
    executor: DatabaseExecutor,
    input: { projectId: string; rightId: string },
  ): Promise<RightRecord | undefined> {
    const [row] = await base(executor)
      .where(
        and(
          eq(projectRights.id, input.rightId),
          eq(projectRights.projectId, input.projectId),
          isNull(projectRights.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      projectId: string;
      rightsType: ProjectRightRow["rightsType"];
      status: ProjectRightRow["status"];
      rightsHolder: string | null;
      expiryDate: string | null;
      notes: string | null;
      createdByUserId: string;
    },
  ): Promise<ProjectRightRow> {
    const [row] = await tx.insert(projectRights).values(input).returning();
    return row;
  },

  updateFields(
    tx: Transaction,
    input: { id: string; expectedVersion: number; values: RightEditableFields },
  ): Promise<ProjectRightRow | undefined> {
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
      status: ProjectRightRow["status"];
    },
  ): Promise<ProjectRightRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { status: input.status },
    });
  },

  softDelete(
    tx: Transaction,
    input: { id: string; expectedVersion: number; deletedAt: Date },
  ): Promise<ProjectRightRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { deletedAt: input.deletedAt },
    });
  },
};

/** Persistence for the right→document lineage join (shared owner pattern). */
export const rightDocumentRepository = createAttachmentRepository({
  table: projectRightDocuments,
  ownerColumn: projectRightDocuments.rightId,
  ownerKey: "rightId",
});

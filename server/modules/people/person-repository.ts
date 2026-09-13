import { and, desc, eq, isNull } from "drizzle-orm";
import {
  applicationUsers,
  projectPeople,
  projectPersonDocuments,
  type ProjectPersonRow,
} from "@shared/schema";
import { createAttachmentRepository } from "../documents/document-attachments";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import type { UserRefColumns } from "../users/user-ref";

export interface PersonRecord {
  person: ProjectPersonRow;
  createdBy: UserRefColumns;
}

/** Only what a profile edit may change; status moves through its own command. */
export type PersonEditableFields = Partial<
  Pick<
    ProjectPersonRow,
    | "name"
    | "roleTitle"
    | "company"
    | "creativeRoleType"
    | "agent"
    | "contacts"
    | "links"
    | "notes"
    | "roleOnProject"
    | "startDate"
    | "contractStatus"
    | "engagementNotes"
  >
>;

const selection = {
  person: projectPeople,
  createdBy: {
    id: applicationUsers.id,
    displayName: applicationUsers.displayName,
    email: applicationUsers.email,
  },
};

function base(executor: DatabaseExecutor) {
  return executor
    .select(selection)
    .from(projectPeople)
    .innerJoin(
      applicationUsers,
      eq(projectPeople.createdByUserId, applicationUsers.id),
    );
}

async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: PersonEditableFields &
      Partial<Pick<ProjectPersonRow, "engagementStatus" | "deletedAt">>;
  },
): Promise<ProjectPersonRow | undefined> {
  const [row] = await tx
    .update(projectPeople)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectPeople.id, input.id),
        eq(projectPeople.version, input.expectedVersion),
        isNull(projectPeople.deletedAt),
      ),
    )
    .returning();
  return row;
}

/** Persistence for `project_people`. Project scoping is part of every lookup. */
export const personRepository = {
  async listByProject(
    executor: DatabaseExecutor,
    input: { projectId: string; kind?: ProjectPersonRow["kind"] },
  ): Promise<PersonRecord[]> {
    const filters = [
      eq(projectPeople.projectId, input.projectId),
      isNull(projectPeople.deletedAt),
    ];
    if (input.kind) filters.push(eq(projectPeople.kind, input.kind));
    return base(executor)
      .where(and(...filters))
      .orderBy(desc(projectPeople.createdAt), desc(projectPeople.id));
  },

  async findById(
    executor: DatabaseExecutor,
    input: { projectId: string; personId: string },
  ): Promise<PersonRecord | undefined> {
    const [row] = await base(executor)
      .where(
        and(
          eq(projectPeople.id, input.personId),
          eq(projectPeople.projectId, input.projectId),
          isNull(projectPeople.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: Omit<
      ProjectPersonRow,
      "id" | "version" | "deletedAt" | "createdAt" | "updatedAt"
    >,
  ): Promise<ProjectPersonRow> {
    const [row] = await tx.insert(projectPeople).values(input).returning();
    return row;
  },

  updateFields(
    tx: Transaction,
    input: {
      id: string;
      expectedVersion: number;
      values: PersonEditableFields;
    },
  ): Promise<ProjectPersonRow | undefined> {
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
      status: ProjectPersonRow["engagementStatus"];
    },
  ): Promise<ProjectPersonRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { engagementStatus: input.status },
    });
  },

  softDelete(
    tx: Transaction,
    input: { id: string; expectedVersion: number; deletedAt: Date },
  ): Promise<ProjectPersonRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { deletedAt: input.deletedAt },
    });
  },
};

/** Persistence for the person→document lineage join (shared owner pattern). */
export const personDocumentRepository = createAttachmentRepository({
  table: projectPersonDocuments,
  ownerColumn: projectPersonDocuments.personId,
  ownerKey: "personId",
});

import { and, desc, eq, isNull } from "drizzle-orm";
import {
  applicationUsers,
  projectNotes,
  type ProjectNoteRow,
} from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";
import type { UserRefColumns } from "../users/user-ref";

export interface NoteRecord {
  note: ProjectNoteRow;
  author: UserRefColumns;
}

/** Only what an edit may change. */
export type NoteEditableFields = Partial<
  Pick<ProjectNoteRow, "body" | "category">
>;

const selection = {
  note: projectNotes,
  author: {
    id: applicationUsers.id,
    displayName: applicationUsers.displayName,
    email: applicationUsers.email,
  },
};

function base(executor: DatabaseExecutor) {
  return executor
    .select(selection)
    .from(projectNotes)
    .innerJoin(
      applicationUsers,
      eq(projectNotes.authorUserId, applicationUsers.id),
    );
}

async function updateIfVersionMatches(
  tx: Transaction,
  input: {
    id: string;
    expectedVersion: number;
    set: NoteEditableFields & Partial<Pick<ProjectNoteRow, "deletedAt">>;
  },
): Promise<ProjectNoteRow | undefined> {
  const [row] = await tx
    .update(projectNotes)
    .set({
      ...input.set,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectNotes.id, input.id),
        eq(projectNotes.version, input.expectedVersion),
        isNull(projectNotes.deletedAt),
      ),
    )
    .returning();
  return row;
}

/** Persistence for `project_notes`. Newest first; soft-deleted rows are invisible. */
export const noteRepository = {
  async listByProject(
    executor: DatabaseExecutor,
    projectId: string,
  ): Promise<NoteRecord[]> {
    return base(executor)
      .where(
        and(
          eq(projectNotes.projectId, projectId),
          isNull(projectNotes.deletedAt),
        ),
      )
      .orderBy(desc(projectNotes.createdAt), desc(projectNotes.id));
  },

  async findById(
    executor: DatabaseExecutor,
    input: { projectId: string; noteId: string },
  ): Promise<NoteRecord | undefined> {
    const [row] = await base(executor)
      .where(
        and(
          eq(projectNotes.id, input.noteId),
          eq(projectNotes.projectId, input.projectId),
          isNull(projectNotes.deletedAt),
        ),
      )
      .limit(1);
    return row;
  },

  async insert(
    tx: Transaction,
    input: {
      projectId: string;
      authorUserId: string;
      body: string;
      category: ProjectNoteRow["category"];
    },
  ): Promise<ProjectNoteRow> {
    const [row] = await tx.insert(projectNotes).values(input).returning();
    return row;
  },

  updateFields(
    tx: Transaction,
    input: { id: string; expectedVersion: number; values: NoteEditableFields },
  ): Promise<ProjectNoteRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: input.values,
    });
  },

  softDelete(
    tx: Transaction,
    input: { id: string; expectedVersion: number; deletedAt: Date },
  ): Promise<ProjectNoteRow | undefined> {
    return updateIfVersionMatches(tx, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      set: { deletedAt: input.deletedAt },
    });
  },
};

import { and, eq, lt } from "drizzle-orm";
import { fileObjects, type FileObjectRow } from "@shared/schema";
import type { DatabaseExecutor, Transaction } from "../../db/transaction";

export interface NewFileObject {
  storageKey: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  createdByUserId: string;
}

/** Persistence for `file_objects`. Lifecycle policy lives in the services. */
export const fileRepository = {
  async insertStaged(
    executor: DatabaseExecutor,
    input: NewFileObject,
  ): Promise<FileObjectRow> {
    const [row] = await executor
      .insert(fileObjects)
      .values({ ...input, status: "staged" })
      .returning();
    return row;
  },

  async findById(
    executor: DatabaseExecutor,
    id: string,
  ): Promise<FileObjectRow | undefined> {
    const [row] = await executor
      .select()
      .from(fileObjects)
      .where(eq(fileObjects.id, id))
      .limit(1);
    return row;
  },

  /** staged → available; returns undefined if the row was not staged. */
  async markAvailable(
    tx: Transaction,
    id: string,
    availableAt: Date,
  ): Promise<FileObjectRow | undefined> {
    const [row] = await tx
      .update(fileObjects)
      .set({ status: "available", availableAt })
      .where(and(eq(fileObjects.id, id), eq(fileObjects.status, "staged")))
      .returning();
    return row;
  },

  /**
   * staged → deleted, only if the row is still staged and was created before
   * `cutoff`. Compare-and-set: a concurrent claim (staged → available) and
   * this transition serialise on the row, and exactly one of them matches.
   * Returns the retired row, or undefined when the row is no longer eligible.
   */
  async retireStaged(
    executor: DatabaseExecutor,
    input: { id: string; cutoff: Date; deletedAt: Date },
  ): Promise<FileObjectRow | undefined> {
    const [row] = await executor
      .update(fileObjects)
      .set({ status: "deleted", deletedAt: input.deletedAt })
      .where(
        and(
          eq(fileObjects.id, input.id),
          eq(fileObjects.status, "staged"),
          lt(fileObjects.createdAt, input.cutoff),
        ),
      )
      .returning();
    return row;
  },

  async listStagedOlderThan(
    executor: DatabaseExecutor,
    cutoff: Date,
    limit: number,
  ): Promise<FileObjectRow[]> {
    return executor
      .select()
      .from(fileObjects)
      .where(
        and(
          eq(fileObjects.status, "staged"),
          lt(fileObjects.createdAt, cutoff),
        ),
      )
      .limit(limit);
  },
};

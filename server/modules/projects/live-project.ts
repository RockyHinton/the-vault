import type { ProjectRow } from "@shared/schema";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { projectRepository } from "./project-repository";

/**
 * The unit of work for every command that changes project-owned state.
 *
 * A soft-deleted project accepts no writes: not to its own children, not to
 * their documents or attachments. This opens the command's transaction and
 * share-locks the live project row before `work` runs, so
 *
 *   - a project that is already deleted answers `404 PROJECT_NOT_FOUND`
 *     (the same answer reads give) before anything is written or audited;
 *   - a project delete cannot commit while the command is in flight, and a
 *     command that starts after the delete committed sees it.
 *
 * Archive is a lifecycle stage of a live project, not deletion: archived
 * projects pass. Project-owned domain services use this instead of
 * `withTransaction` (enforced by lint); the Projects domain's own commands
 * guard deletion in their compare-and-set predicates.
 */
export function withLiveProjectTransaction<T>(
  db: Database,
  projectId: string,
  work: (tx: Transaction, project: ProjectRow) => Promise<T>,
): Promise<T> {
  return withTransaction(db, async (tx) => {
    const project = await projectRepository.lockLive(tx, projectId);
    if (!project)
      throw new ApiError(
        404,
        "PROJECT_NOT_FOUND",
        "The project was not found.",
      );
    return work(tx, project);
  });
}

import type {
  ArchiveReason,
  CreateProjectInput,
  Project,
  ProjectStage,
  UpdateProjectInput,
} from "@shared/contracts";
import type { ProjectRow } from "@shared/schema";
import { ApiError } from "../../http/errors";
import { canTransitionProjectStage } from "./project-lifecycle";
import { ProjectRepository } from "./project-repository";

const repository = new ProjectRepository();

function toContract(row: ProjectRow): Project {
  const archive =
    row.archivedAt &&
    row.archiveReason &&
    row.archiveRevisit &&
    row.archiveStarred !== null &&
    row.archivedFromStage
      ? {
          reason: row.archiveReason,
          revisit: row.archiveRevisit,
          starred: row.archiveStarred,
          notes: row.archiveNotes,
          archivedFromStage: row.archivedFromStage,
        }
      : null;
  return {
    id: row.id,
    title: row.title,
    logline: row.logline,
    synopsis: row.synopsis,
    genre: row.genre,
    stage: row.stage,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archive,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireProject(row: ProjectRow | undefined): ProjectRow {
  if (!row)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
  return row;
}

function conflict(): never {
  throw new ApiError(
    409,
    "VERSION_CONFLICT",
    "This project changed while you were editing it. Refresh and try again.",
  );
}

export class ProjectService {
  async list(input: {
    archived: "true" | "false" | "all";
    limit: number;
    cursor?: string;
  }) {
    const rows = await repository.list(input);
    return {
      items: rows.map(toContract),
      nextCursor:
        rows.length === input.limit ? (rows.at(-1)?.id ?? null) : null,
    };
  }

  async get(id: string) {
    return toContract(requireProject(await repository.findById(id)));
  }

  async create(
    input: CreateProjectInput,
    actorUserId: string,
    requestId: string,
  ) {
    const row = await repository.create(
      {
        title: input.title,
        logline: input.logline || null,
        synopsis: input.synopsis || null,
        genre: input.genre || null,
        createdByUserId: actorUserId,
      },
      requestId,
    );
    return toContract(row);
  }

  async update(
    id: string,
    input: UpdateProjectInput,
    actorUserId: string,
    requestId: string,
  ) {
    const existing = requireProject(await repository.findById(id));
    if (existing.archivedAt)
      throw new ApiError(
        409,
        "PROJECT_ARCHIVED",
        "Restore the project before editing it.",
      );
    const { version, ...changes } = input;
    const row = await repository.compareAndUpdate({
      id,
      version,
      actorUserId,
      requestId,
      values: {
        ...changes,
        logline:
          changes.logline === undefined ? undefined : changes.logline || null,
        synopsis:
          changes.synopsis === undefined ? undefined : changes.synopsis || null,
        genre: changes.genre === undefined ? undefined : changes.genre || null,
      },
    });
    if (!row) conflict();
    return toContract(row);
  }

  async transition(
    id: string,
    input: { toStage: ProjectStage; version: number; note?: string },
    actorUserId: string,
    requestId: string,
  ) {
    const existing = requireProject(await repository.findById(id));
    if (existing.archivedAt)
      throw new ApiError(
        409,
        "PROJECT_ARCHIVED",
        "Restore the project before changing its stage.",
      );
    if (!canTransitionProjectStage(existing.stage, input.toStage)) {
      throw new ApiError(
        422,
        "INVALID_STAGE_TRANSITION",
        "That project stage transition is not permitted.",
      );
    }
    const row = await repository.transition({
      project: existing,
      ...input,
      actorUserId,
      requestId,
    });
    if (!row) conflict();
    return toContract(row);
  }

  async archive(
    id: string,
    input: {
      reason: ArchiveReason;
      revisit: "yes" | "maybe" | "no";
      starred: boolean;
      notes?: string;
      version: number;
    },
    actorUserId: string,
    requestId: string,
  ) {
    const existing = requireProject(await repository.findById(id));
    if (existing.archivedAt)
      throw new ApiError(
        409,
        "PROJECT_ALREADY_ARCHIVED",
        "This project is already archived.",
      );
    const row = await repository.archive({
      project: existing,
      ...input,
      actorUserId,
      requestId,
    });
    if (!row) conflict();
    return toContract(row);
  }

  async restore(
    id: string,
    version: number,
    actorUserId: string,
    requestId: string,
  ) {
    const existing = requireProject(await repository.findById(id));
    if (!existing.archivedAt)
      throw new ApiError(
        409,
        "PROJECT_NOT_ARCHIVED",
        "This project is not archived.",
      );
    const row = await repository.restore({
      project: existing,
      version,
      actorUserId,
      requestId,
    });
    if (!row) conflict();
    return toContract(row);
  }

  async delete(
    id: string,
    version: number,
    actorUserId: string,
    requestId: string,
  ) {
    const existing = requireProject(await repository.findById(id));
    const row = await repository.softDelete({
      project: existing,
      version,
      actorUserId,
      requestId,
    });
    if (!row) conflict();
  }
}

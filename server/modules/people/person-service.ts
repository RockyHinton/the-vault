import type {
  AttachNewPersonDocumentInput,
  ChangePersonStatusInput,
  CreatePersonInput,
  Document,
  DocumentFolder,
  Person,
  PersonKind,
  UpdatePersonInput,
} from "@shared/contracts";
import type { ProjectPersonRow } from "@shared/schema";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import { documentRepository } from "../documents/document-repository";
import {
  createDocumentInTransaction,
  toDocumentContract,
} from "../documents/document-service";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import {
  personDocumentRepository,
  personRepository,
  type PersonEditableFields,
  type PersonRecord,
} from "./person-repository";

export interface PersonActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

/** Profile documents live in the workspace folder that matches the person's kind. */
const folderForKind: Record<PersonKind, DocumentFolder> = {
  producer: "producers",
  creative: "creatives",
};

function toContract(record: PersonRecord, documents: Document[]): Person {
  const { person, createdBy } = record;
  return {
    id: person.id,
    projectId: person.projectId,
    kind: person.kind,
    name: person.name,
    roleTitle: person.roleTitle,
    company: person.company,
    creativeRoleType: person.creativeRoleType,
    agent: person.agent,
    contacts: person.contacts,
    links: person.links,
    notes: person.notes,
    engagement: {
      status: person.engagementStatus,
      roleOnProject: person.roleOnProject,
      startDate: person.startDate,
      contractStatus: person.contractStatus,
      notes: person.engagementNotes,
    },
    documents,
    createdBy: toUserRef(createdBy),
    version: person.version,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

function requirePerson(record: PersonRecord | undefined): PersonRecord {
  if (!record)
    throw new ApiError(404, "PERSON_NOT_FOUND", "The person was not found.");
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This profile changed while you were editing. Refresh and try again.",
    );
  return row;
}

/** Destructive commands follow the authored-record rule; everything else is collaborative. */
function assertCanRemove(actor: PersonActor, record: PersonRecord): void {
  if (actor.role === "studio_admin") return;
  if (record.person.createdByUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the user who added this profile or a studio administrator can remove it.",
  );
}

/** Kind-specific columns may only be set for the matching kind. */
function assertFieldsMatchKind(
  kind: PersonKind,
  input: Pick<UpdatePersonInput, "company" | "creativeRoleType" | "agent">,
): void {
  const misplaced =
    kind === "producer"
      ? input.creativeRoleType !== undefined || input.agent !== undefined
      : input.company !== undefined;
  if (misplaced) {
    throw new ApiError(
      422,
      "FIELD_NOT_APPLICABLE",
      kind === "producer"
        ? "Producers do not have a creative role type or an agent."
        : "Creatives do not have a company; use the agent field.",
    );
  }
}

async function requireProject(
  executor: Transaction | Database,
  projectId: string,
) {
  const project = await projectRepository.findById(executor, projectId);
  if (!project)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
}

const blankToNull = (value: string | null | undefined) =>
  value === undefined ? undefined : value || null;

/**
 * People engaged with a project: producers and creatives in one aggregate.
 * Any active user records, edits, moves status and attaches documents (the
 * board is collaborative); removing a profile or an attachment is the
 * creator's or an admin's. Documents are created through the Documents
 * domain and linked by lineage, never copied.
 */
export function createPersonService({ db }: { db: Database }) {
  /** Attached current document versions, keyed by person id, in one query pair. */
  async function documentsByPerson(
    executor: Transaction | Database,
    projectId: string,
    personIds: string[],
  ): Promise<Map<string, Document[]>> {
    const links = await personDocumentRepository.listByPersons(
      executor,
      personIds,
    );
    const records = await documentRepository.listCurrentByLineages(executor, {
      projectId,
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
    const result = new Map<string, Document[]>(personIds.map((id) => [id, []]));
    for (const link of links) {
      const document = byLineage.get(link.documentLineageId);
      if (document) result.get(link.personId)?.push(document);
    }
    return result;
  }

  async function load(
    executor: Transaction | Database,
    projectId: string,
    personId: string,
  ): Promise<Person> {
    const record = requirePerson(
      await personRepository.findById(executor, { projectId, personId }),
    );
    const documents = await documentsByPerson(executor, projectId, [personId]);
    return toContract(record, documents.get(personId) ?? []);
  }

  return {
    async list(
      projectId: string,
      input: { kind?: PersonKind },
    ): Promise<Person[]> {
      await requireProject(db, projectId);
      const records = await personRepository.listByProject(db, {
        projectId,
        kind: input.kind,
      });
      const documents = await documentsByPerson(
        db,
        projectId,
        records.map((record) => record.person.id),
      );
      return records.map((record) =>
        toContract(record, documents.get(record.person.id) ?? []),
      );
    },

    async get(projectId: string, personId: string): Promise<Person> {
      await requireProject(db, projectId);
      return load(db, projectId, personId);
    },

    async create(
      projectId: string,
      input: CreatePersonInput,
      actor: PersonActor,
    ): Promise<Person> {
      const id = await withTransaction(db, async (tx) => {
        await requireProject(tx, projectId);
        const created = await personRepository.insert(tx, {
          projectId,
          kind: input.kind,
          name: input.name,
          roleTitle: input.roleTitle,
          company: input.kind === "producer" ? input.company : null,
          creativeRoleType:
            input.kind === "creative" ? input.creativeRoleType : null,
          agent: input.kind === "creative" ? input.agent || null : null,
          contacts: input.contacts,
          links: input.links,
          notes: input.notes || null,
          engagementStatus: input.status,
          roleOnProject: input.engagement.roleOnProject || null,
          startDate: input.engagement.startDate ?? null,
          contractStatus: input.engagement.contractStatus ?? null,
          engagementNotes: input.engagement.notes || null,
          createdByUserId: actor.userId,
        });
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "person.created",
          entityType: "project_person",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: { projectId, kind: input.kind, status: input.status },
        });
        return created.id;
      });
      return load(db, projectId, id);
    },

    async update(
      projectId: string,
      personId: string,
      input: UpdatePersonInput,
      actor: PersonActor,
    ): Promise<Person> {
      const values: PersonEditableFields = {
        name: input.name,
        roleTitle: input.roleTitle,
        company: input.company,
        creativeRoleType: input.creativeRoleType,
        agent: blankToNull(input.agent),
        contacts: input.contacts,
        links: input.links,
        notes: blankToNull(input.notes),
        roleOnProject: blankToNull(input.engagement?.roleOnProject),
        startDate: input.engagement?.startDate,
        contractStatus: input.engagement?.contractStatus,
        engagementNotes: blankToNull(input.engagement?.notes),
      };
      const changedFields = (
        Object.keys(values) as (keyof PersonEditableFields)[]
      ).filter((key) => values[key] !== undefined);
      await withTransaction(db, async (tx) => {
        const existing = requirePerson(
          await personRepository.findById(tx, { projectId, personId }),
        );
        assertFieldsMatchKind(existing.person.kind, input);
        requireFresh(
          await personRepository.updateFields(tx, {
            id: personId,
            expectedVersion: input.version,
            values,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "person.updated",
          entityType: "project_person",
          entityId: personId,
          requestId: actor.requestId,
          metadata: { projectId, changedFields },
        });
      });
      return load(db, projectId, personId);
    },

    /** The engagement status is a lifecycle command with its own audit trail. */
    async changeStatus(
      projectId: string,
      personId: string,
      input: ChangePersonStatusInput,
      actor: PersonActor,
    ): Promise<Person> {
      await withTransaction(db, async (tx) => {
        const existing = requirePerson(
          await personRepository.findById(tx, { projectId, personId }),
        );
        if (existing.person.engagementStatus === input.status) {
          throw new ApiError(
            409,
            "STATUS_UNCHANGED",
            "The profile already has that status.",
          );
        }
        requireFresh(
          await personRepository.changeStatus(tx, {
            id: personId,
            expectedVersion: input.version,
            status: input.status,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "person.status_changed",
          entityType: "project_person",
          entityId: personId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            from: existing.person.engagementStatus,
            to: input.status,
          },
        });
      });
      return load(db, projectId, personId);
    },

    /** Soft delete; attachments are kept with the row, documents are untouched. */
    async delete(
      projectId: string,
      personId: string,
      version: number,
      actor: PersonActor,
    ): Promise<void> {
      await withTransaction(db, async (tx) => {
        const existing = requirePerson(
          await personRepository.findById(tx, { projectId, personId }),
        );
        assertCanRemove(actor, existing);
        requireFresh(
          await personRepository.softDelete(tx, {
            id: personId,
            expectedVersion: version,
            deletedAt: new Date(),
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "person.deleted",
          entityType: "project_person",
          entityId: personId,
          requestId: actor.requestId,
          metadata: { projectId, kind: existing.person.kind },
        });
      });
    },

    /**
     * Upload-and-attach in one unit of work: the Documents domain creates the
     * document in the kind's folder (claiming the staged file and writing its
     * own audit event), then the link row is inserted here.
     */
    async attachNewDocument(
      projectId: string,
      personId: string,
      input: AttachNewPersonDocumentInput,
      actor: PersonActor,
    ): Promise<Person> {
      await withTransaction(db, async (tx) => {
        const existing = requirePerson(
          await personRepository.findById(tx, { projectId, personId }),
        );
        const document = await createDocumentInTransaction(tx, {
          projectId,
          document: { ...input, folder: folderForKind[existing.person.kind] },
          actor,
        });
        await attach(tx, existing.person, document.lineageId, actor);
      });
      return load(db, projectId, personId);
    },

    /** Attach an existing document of the same project by any of its version ids. */
    async attachExistingDocument(
      projectId: string,
      personId: string,
      documentId: string,
      actor: PersonActor,
    ): Promise<Person> {
      await withTransaction(db, async (tx) => {
        const existing = requirePerson(
          await personRepository.findById(tx, { projectId, personId }),
        );
        const document = await documentRepository.findById(tx, {
          projectId,
          documentId,
        });
        if (!document)
          throw new ApiError(
            404,
            "DOCUMENT_NOT_FOUND",
            "The document was not found.",
          );
        const already = await personDocumentRepository.find(tx, {
          personId,
          documentLineageId: document.document.lineageId,
        });
        if (already)
          throw new ApiError(
            409,
            "DOCUMENT_ALREADY_ATTACHED",
            "That document is already attached to this profile.",
          );
        await attach(tx, existing.person, document.document.lineageId, actor);
      });
      return load(db, projectId, personId);
    },

    /** Removes the link only; the document and its versions stay in the library. */
    async detachDocument(
      projectId: string,
      personId: string,
      documentId: string,
      actor: PersonActor,
    ): Promise<Person> {
      await withTransaction(db, async (tx) => {
        const existing = requirePerson(
          await personRepository.findById(tx, { projectId, personId }),
        );
        assertCanRemove(actor, existing);
        const document = await documentRepository.findById(tx, {
          projectId,
          documentId,
        });
        const lineageId = document?.document.lineageId ?? documentId;
        const removed = await personDocumentRepository.delete(tx, {
          personId,
          documentLineageId: lineageId,
        });
        if (!removed)
          throw new ApiError(
            404,
            "ATTACHMENT_NOT_FOUND",
            "That document is not attached to this profile.",
          );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "person.document_detached",
          entityType: "project_person",
          entityId: personId,
          requestId: actor.requestId,
          metadata: { projectId, documentLineageId: lineageId },
        });
      });
      return load(db, projectId, personId);
    },
  };

  async function attach(
    tx: Transaction,
    person: ProjectPersonRow,
    documentLineageId: string,
    actor: PersonActor,
  ) {
    await personDocumentRepository.insert(tx, {
      personId: person.id,
      documentLineageId,
      attachedByUserId: actor.userId,
    });
    await appendAuditEvent(tx, {
      actorUserId: actor.userId,
      action: "person.document_attached",
      entityType: "project_person",
      entityId: person.id,
      requestId: actor.requestId,
      metadata: { projectId: person.projectId, documentLineageId },
    });
  }
}

export type PersonService = ReturnType<typeof createPersonService>;

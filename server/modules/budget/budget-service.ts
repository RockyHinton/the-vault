import {
  defaultBudgetDepartments,
  type AttachNewOwnerDocumentInput,
  type Budget,
  type BudgetDepartment,
  type BudgetLineItem,
  type BudgetVersion,
  type BudgetVersionSummary,
  type CreateBudgetDepartmentInput,
  type CreateBudgetInput,
  type CreateBudgetLineItemInput,
  type Document,
  type UpdateBudgetDepartmentInput,
  type UpdateBudgetLineItemInput,
} from "@shared/contracts";
import type { BudgetLineItemRow, BudgetVersionRow } from "@shared/schema";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { appendAuditEvent } from "../audit/audit-repository";
import { documentRepository } from "../documents/document-repository";
import { createDocumentInTransaction } from "../documents/document-service";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import {
  budgetDepartmentDocumentRepository,
  budgetDepartmentRepository,
  budgetLineItemRepository,
  budgetRepository,
  budgetVersionRepository,
  type BudgetRecord,
  type BudgetVersionRecord,
} from "./budget-repository";

export interface BudgetActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

/** Supporting documents are filed in the workspace's Budget folder. */
const BUDGET_FOLDER = "financing/budget" as const;

const ZERO = "0.00";

function toSummary(
  record: BudgetVersionRecord,
  total: string,
): BudgetVersionSummary {
  const { version, createdBy, submittedBy, lockedBy } = record;
  return {
    id: version.id,
    budgetId: version.budgetId,
    versionNumber: version.versionNumber,
    status: version.status,
    total,
    createdBy: toUserRef(createdBy),
    createdAt: version.createdAt.toISOString(),
    submittedBy: submittedBy ? toUserRef(submittedBy) : null,
    submittedAt: version.submittedAt?.toISOString() ?? null,
    lockedBy: lockedBy ? toUserRef(lockedBy) : null,
    lockedAt: version.lockedAt?.toISOString() ?? null,
    version: version.version,
    updatedAt: version.updatedAt.toISOString(),
  };
}

function toLineItem(row: BudgetLineItemRow): BudgetLineItem {
  return {
    id: row.id,
    departmentId: row.budgetDepartmentId,
    name: row.name,
    amount: row.amount,
    note: row.note,
    position: row.position,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireBudget(record: BudgetRecord | undefined): BudgetRecord {
  if (!record)
    throw new ApiError(
      404,
      "BUDGET_NOT_FOUND",
      "This project has no budget yet.",
    );
  return record;
}

function requireVersion(
  record: BudgetVersionRecord | undefined,
): BudgetVersionRecord {
  if (!record)
    throw new ApiError(
      404,
      "BUDGET_VERSION_NOT_FOUND",
      "The budget version was not found.",
    );
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "The budget changed while you were editing. Refresh and try again.",
    );
  return row;
}

/**
 * The lock guarantee: only a draft's contents may change. Callers hold the
 * version's row lock (taken by `lockRow`) so this check cannot be raced by a
 * concurrent submit or lock.
 */
function assertDraft(version: BudgetVersionRow): void {
  if (version.status !== "draft") {
    throw new ApiError(
      409,
      "BUDGET_VERSION_NOT_EDITABLE",
      version.status === "locked"
        ? "This budget version is locked. Start a revision to make changes."
        : "This budget version is awaiting approval and cannot be edited.",
    );
  }
}

/** Approving a budget is a financial sign-off: studio administrators only. */
function assertCanLock(actor: BudgetActor): void {
  if (actor.role !== "studio_admin")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only a studio administrator can approve and lock a budget.",
    );
}

async function requireProject(
  executor: Transaction | Database,
  projectId: string,
) {
  const project = await projectRepository.findById(executor, projectId);
  if (!project)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "The project was not found.");
}

/**
 * Budget use-cases. One budget per project with numbered versions; at most
 * one version is open at a time (PostgreSQL enforces it). Content edits are
 * collaborative and draft-only; submit is collaborative; approve-and-lock is
 * an administrator's; a locked version is permanent financial history and a
 * revision copies it into a new draft. Totals are always computed by
 * PostgreSQL from the line items.
 */
export function createBudgetService({ db }: { db: Database }) {
  async function loadVersion(
    executor: Transaction | Database,
    projectId: string,
    versionId: string,
    currency: Budget["currency"],
  ): Promise<BudgetVersion> {
    const record = requireVersion(
      await budgetVersionRepository.findById(executor, {
        projectId,
        versionId,
      }),
    );
    const departments = await budgetDepartmentRepository.listByVersion(
      executor,
      versionId,
    );
    const departmentIds = departments.map((d) => d.id);
    const [lineItems, documents, departmentTotals, versionTotals] =
      await Promise.all([
        budgetLineItemRepository.listByDepartments(executor, departmentIds),
        budgetDepartmentDocumentRepository.loadDocumentsByOwner(executor, {
          projectId,
          ownerIds: departmentIds,
        }),
        budgetLineItemRepository.totalsByDepartment(executor, departmentIds),
        budgetLineItemRepository.totalsByVersion(executor, [versionId]),
      ]);
    return {
      ...toSummary(record, versionTotals.get(versionId) ?? ZERO),
      currency,
      departments: departments.map((department): BudgetDepartment => ({
        id: department.id,
        budgetVersionId: department.budgetVersionId,
        name: department.name,
        position: department.position,
        total: departmentTotals.get(department.id) ?? ZERO,
        lineItems: lineItems
          .filter((item) => item.budgetDepartmentId === department.id)
          .map(toLineItem),
        documents: documents.get(department.id) ?? [],
        version: department.version,
        createdAt: department.createdAt.toISOString(),
        updatedAt: department.updatedAt.toISOString(),
      })),
    };
  }

  async function loadBudget(
    executor: Transaction | Database,
    projectId: string,
  ): Promise<Budget> {
    const record = requireBudget(
      await budgetRepository.findByProject(executor, projectId),
    );
    const versions = await budgetVersionRepository.listByBudget(
      executor,
      record.budget.id,
    );
    const totals = await budgetLineItemRepository.totalsByVersion(
      executor,
      versions.map((v) => v.version.id),
    );
    const open = versions.find((v) => v.version.status !== "locked");
    const latestLocked = versions.find((v) => v.version.status === "locked");
    const current = open ?? latestLocked;
    if (!current) throw new Error("A budget always has at least one version.");
    return {
      id: record.budget.id,
      projectId,
      currency: record.budget.currency,
      createdBy: toUserRef(record.createdBy),
      createdAt: record.budget.createdAt.toISOString(),
      currentVersion: await loadVersion(
        executor,
        projectId,
        current.version.id,
        record.budget.currency,
      ),
      latestLockedVersionId: latestLocked?.version.id ?? null,
      versions: versions.map((v) =>
        toSummary(v, totals.get(v.version.id) ?? ZERO),
      ),
    };
  }

  /** Resolves a department for editing: project-scoped, row-locked, draft-only. */
  async function requireEditableDepartment(
    tx: Transaction,
    projectId: string,
    departmentId: string,
  ) {
    const scope = await budgetDepartmentRepository.findScoped(tx, {
      projectId,
      departmentId,
    });
    if (!scope)
      throw new ApiError(
        404,
        "BUDGET_DEPARTMENT_NOT_FOUND",
        "The department was not found.",
      );
    const locked = requireVersion(
      (await budgetVersionRepository.lockRow(tx, scope.version.id)) &&
        (await budgetVersionRepository.findById(tx, {
          projectId,
          versionId: scope.version.id,
        })),
    );
    assertDraft(locked.version);
    return { ...scope, version: locked.version };
  }

  async function attach(
    tx: Transaction,
    input: {
      projectId: string;
      departmentId: string;
      versionId: string;
      documentLineageId: string;
    },
    actor: BudgetActor,
  ) {
    await budgetDepartmentDocumentRepository.insert(tx, {
      ownerId: input.departmentId,
      documentLineageId: input.documentLineageId,
      attachedByUserId: actor.userId,
    });
    await budgetVersionRepository.touch(tx, input.versionId);
    await appendAuditEvent(tx, {
      actorUserId: actor.userId,
      action: "budget_department.document_attached",
      entityType: "budget_department",
      entityId: input.departmentId,
      requestId: actor.requestId,
      metadata: {
        projectId: input.projectId,
        budgetVersionId: input.versionId,
        documentLineageId: input.documentLineageId,
      },
    });
  }

  return {
    async get(projectId: string): Promise<Budget> {
      await requireProject(db, projectId);
      return loadBudget(db, projectId);
    },

    /** One exact version, current or historical, with its full contents. */
    async getVersion(
      projectId: string,
      versionId: string,
    ): Promise<BudgetVersion> {
      const budget = requireBudget(
        await budgetRepository.findByProject(db, projectId),
      );
      return loadVersion(db, projectId, versionId, budget.budget.currency);
    },

    /** Creates the budget and version 1 with the default departments, atomically. */
    async create(
      projectId: string,
      input: CreateBudgetInput,
      actor: BudgetActor,
    ): Promise<Budget> {
      await withTransaction(db, async (tx) => {
        await requireProject(tx, projectId);
        if (await budgetRepository.findByProject(tx, projectId))
          throw new ApiError(
            409,
            "BUDGET_EXISTS",
            "This project already has a budget.",
          );
        const budget = await budgetRepository.insert(tx, {
          projectId,
          currency: input.currency,
          createdByUserId: actor.userId,
        });
        const version = await budgetVersionRepository.insert(tx, {
          budgetId: budget.id,
          versionNumber: 1,
          createdByUserId: actor.userId,
        });
        for (const [position, name] of Array.from(
          defaultBudgetDepartments.entries(),
        )) {
          await budgetDepartmentRepository.insert(tx, {
            budgetVersionId: version.id,
            name,
            position,
          });
        }
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget.created",
          entityType: "budget",
          entityId: budget.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            currency: input.currency,
            budgetVersionId: version.id,
          },
        });
      });
      return loadBudget(db, projectId);
    },

    /** Draft → awaiting approval. Any active user may submit. */
    async submit(
      projectId: string,
      versionId: string,
      expectedVersion: number,
      actor: BudgetActor,
    ): Promise<Budget> {
      await withTransaction(db, async (tx) => {
        const existing = requireVersion(
          await budgetVersionRepository.findById(tx, { projectId, versionId }),
        );
        const total =
          (await budgetLineItemRepository.totalsByVersion(tx, [versionId])).get(
            versionId,
          ) ?? ZERO;
        if (existing.version.status !== "draft")
          throw new ApiError(
            409,
            "BUDGET_VERSION_NOT_DRAFT",
            "Only a draft budget can be submitted for approval.",
          );
        requireFresh(
          await budgetVersionRepository.submit(tx, {
            id: versionId,
            expectedVersion,
            submittedByUserId: actor.userId,
            at: new Date(),
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget_version.submitted",
          entityType: "budget_version",
          entityId: versionId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            versionNumber: existing.version.versionNumber,
            total,
          },
        });
      });
      return loadBudget(db, projectId);
    },

    /** Awaiting approval → locked. studio_admin only. The version is never written again. */
    async lock(
      projectId: string,
      versionId: string,
      expectedVersion: number,
      actor: BudgetActor,
    ): Promise<Budget> {
      assertCanLock(actor);
      await withTransaction(db, async (tx) => {
        const existing = requireVersion(
          await budgetVersionRepository.findById(tx, { projectId, versionId }),
        );
        const total =
          (await budgetLineItemRepository.totalsByVersion(tx, [versionId])).get(
            versionId,
          ) ?? ZERO;
        if (existing.version.status !== "awaiting_approval")
          throw new ApiError(
            409,
            "BUDGET_VERSION_NOT_SUBMITTED",
            "Submit the budget for approval before locking it.",
          );
        requireFresh(
          await budgetVersionRepository.lock(tx, {
            id: versionId,
            expectedVersion,
            lockedByUserId: actor.userId,
            at: new Date(),
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget_version.locked",
          entityType: "budget_version",
          entityId: versionId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            versionNumber: existing.version.versionNumber,
            total,
          },
        });
      });
      return loadBudget(db, projectId);
    },

    /**
     * Starts a revision: a new draft (next number) copying the locked
     * version's departments, line items and document links. The locked
     * version is untouched. Refused while another version is open.
     */
    async startRevision(
      projectId: string,
      fromVersionId: string,
      actor: BudgetActor,
    ): Promise<Budget> {
      await withTransaction(db, async (tx) => {
        const source = requireVersion(
          await budgetVersionRepository.findById(tx, {
            projectId,
            versionId: fromVersionId,
          }),
        );
        if (source.version.status !== "locked")
          throw new ApiError(
            409,
            "BUDGET_VERSION_NOT_LOCKED",
            "Revisions start from a locked version.",
          );
        const versions = await budgetVersionRepository.listByBudget(
          tx,
          source.version.budgetId,
        );
        if (versions.some((v) => v.version.status !== "locked"))
          throw new ApiError(
            409,
            "BUDGET_VERSION_ALREADY_OPEN",
            "Finish the open budget version before starting another revision.",
          );
        const nextNumber =
          Math.max(...versions.map((v) => v.version.versionNumber)) + 1;
        const draft = await budgetVersionRepository.insert(tx, {
          budgetId: source.version.budgetId,
          versionNumber: nextNumber,
          createdByUserId: actor.userId,
        });
        const departments = await budgetDepartmentRepository.listByVersion(
          tx,
          fromVersionId,
        );
        const sourceIds = departments.map((d) => d.id);
        const lineItems = await budgetLineItemRepository.listByDepartments(
          tx,
          sourceIds,
        );
        const links = await budgetDepartmentDocumentRepository.listByOwners(
          tx,
          sourceIds,
        );
        for (const department of departments) {
          const copy = await budgetDepartmentRepository.insert(tx, {
            budgetVersionId: draft.id,
            name: department.name,
            position: department.position,
          });
          for (const item of lineItems.filter(
            (i) => i.budgetDepartmentId === department.id,
          )) {
            await budgetLineItemRepository.insert(tx, {
              budgetDepartmentId: copy.id,
              name: item.name,
              amount: item.amount,
              note: item.note,
              position: item.position,
            });
          }
          for (const link of links.filter((l) => l.ownerId === department.id)) {
            await budgetDepartmentDocumentRepository.insert(tx, {
              ownerId: copy.id,
              documentLineageId: link.documentLineageId,
              attachedByUserId: link.attachedByUserId,
            });
          }
        }
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget_version.created",
          entityType: "budget_version",
          entityId: draft.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            versionNumber: nextNumber,
            copiedFromVersionId: fromVersionId,
            copiedFromVersionNumber: source.version.versionNumber,
          },
        });
      });
      return loadBudget(db, projectId);
    },

    async createDepartment(
      projectId: string,
      versionId: string,
      input: CreateBudgetDepartmentInput,
      actor: BudgetActor,
    ): Promise<BudgetVersion> {
      const currency = requireBudget(
        await budgetRepository.findByProject(db, projectId),
      ).budget.currency;
      await withTransaction(db, async (tx) => {
        await budgetVersionRepository.lockRow(tx, versionId);
        const version = requireVersion(
          await budgetVersionRepository.findById(tx, { projectId, versionId }),
        );
        assertDraft(version.version);
        const siblings = await budgetDepartmentRepository.listByVersion(
          tx,
          versionId,
        );
        if (
          siblings.some(
            (d) => d.name.toLowerCase() === input.name.toLowerCase(),
          )
        )
          throw new ApiError(
            409,
            "BUDGET_DEPARTMENT_NAME_TAKEN",
            "A department with that name already exists in this version.",
          );
        const created = await budgetDepartmentRepository.insert(tx, {
          budgetVersionId: versionId,
          name: input.name,
          position: await budgetDepartmentRepository.nextPosition(
            tx,
            versionId,
          ),
        });
        await budgetVersionRepository.touch(tx, versionId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget_department.created",
          entityType: "budget_department",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: { projectId, budgetVersionId: versionId, name: input.name },
        });
      });
      return loadVersion(db, projectId, versionId, currency);
    },

    async renameDepartment(
      projectId: string,
      departmentId: string,
      input: UpdateBudgetDepartmentInput,
      actor: BudgetActor,
    ): Promise<BudgetVersion> {
      const currency = requireBudget(
        await budgetRepository.findByProject(db, projectId),
      ).budget.currency;
      const versionId = await withTransaction(db, async (tx) => {
        const scope = await requireEditableDepartment(
          tx,
          projectId,
          departmentId,
        );
        const siblings = await budgetDepartmentRepository.listByVersion(
          tx,
          scope.version.id,
        );
        if (
          siblings.some(
            (d) =>
              d.id !== departmentId &&
              d.name.toLowerCase() === input.name.toLowerCase(),
          )
        )
          throw new ApiError(
            409,
            "BUDGET_DEPARTMENT_NAME_TAKEN",
            "A department with that name already exists in this version.",
          );
        requireFresh(
          await budgetDepartmentRepository.rename(tx, {
            id: departmentId,
            expectedVersion: input.version,
            name: input.name,
          }),
        );
        await budgetVersionRepository.touch(tx, scope.version.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget_department.updated",
          entityType: "budget_department",
          entityId: departmentId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            budgetVersionId: scope.version.id,
            from: scope.department.name,
            to: input.name,
          },
        });
        return scope.version.id;
      });
      return loadVersion(db, projectId, versionId, currency);
    },

    /** A department may be removed only while empty, as in the validated product. */
    async deleteDepartment(
      projectId: string,
      departmentId: string,
      actor: BudgetActor,
    ): Promise<BudgetVersion> {
      const currency = requireBudget(
        await budgetRepository.findByProject(db, projectId),
      ).budget.currency;
      const versionId = await withTransaction(db, async (tx) => {
        const scope = await requireEditableDepartment(
          tx,
          projectId,
          departmentId,
        );
        const contents = await budgetDepartmentRepository.countContents(
          tx,
          departmentId,
        );
        if (contents.lineItems > 0 || contents.documents > 0)
          throw new ApiError(
            409,
            "BUDGET_DEPARTMENT_NOT_EMPTY",
            "Remove line items and documents before deleting the department.",
          );
        await budgetDepartmentRepository.delete(tx, departmentId);
        await budgetVersionRepository.touch(tx, scope.version.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget_department.deleted",
          entityType: "budget_department",
          entityId: departmentId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            budgetVersionId: scope.version.id,
            name: scope.department.name,
          },
        });
        return scope.version.id;
      });
      return loadVersion(db, projectId, versionId, currency);
    },

    async createLineItem(
      projectId: string,
      departmentId: string,
      input: CreateBudgetLineItemInput,
      actor: BudgetActor,
    ): Promise<BudgetVersion> {
      const currency = requireBudget(
        await budgetRepository.findByProject(db, projectId),
      ).budget.currency;
      const versionId = await withTransaction(db, async (tx) => {
        const scope = await requireEditableDepartment(
          tx,
          projectId,
          departmentId,
        );
        const created = await budgetLineItemRepository.insert(tx, {
          budgetDepartmentId: departmentId,
          name: input.name,
          amount: input.amount,
          note: input.note || null,
          position: await budgetLineItemRepository.nextPosition(
            tx,
            departmentId,
          ),
        });
        await budgetVersionRepository.touch(tx, scope.version.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget_line_item.created",
          entityType: "budget_line_item",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            budgetVersionId: scope.version.id,
            departmentId,
            amount: input.amount,
          },
        });
        return scope.version.id;
      });
      return loadVersion(db, projectId, versionId, currency);
    },

    async updateLineItem(
      projectId: string,
      lineItemId: string,
      input: UpdateBudgetLineItemInput,
      actor: BudgetActor,
    ): Promise<BudgetVersion> {
      const currency = requireBudget(
        await budgetRepository.findByProject(db, projectId),
      ).budget.currency;
      const values = {
        name: input.name,
        amount: input.amount,
        note: input.note === undefined ? undefined : input.note || null,
      };
      const changedFields = (
        Object.keys(values) as (keyof typeof values)[]
      ).filter((key) => values[key] !== undefined);
      const versionId = await withTransaction(db, async (tx) => {
        const scope = await budgetLineItemRepository.findScoped(tx, {
          projectId,
          lineItemId,
        });
        if (!scope)
          throw new ApiError(
            404,
            "BUDGET_LINE_ITEM_NOT_FOUND",
            "The line item was not found.",
          );
        await requireEditableDepartment(tx, projectId, scope.department.id);
        requireFresh(
          await budgetLineItemRepository.update(tx, {
            id: lineItemId,
            expectedVersion: input.version,
            values,
          }),
        );
        await budgetVersionRepository.touch(tx, scope.version.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget_line_item.updated",
          entityType: "budget_line_item",
          entityId: lineItemId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            budgetVersionId: scope.version.id,
            changedFields,
            ...(input.amount !== undefined
              ? { fromAmount: scope.lineItem.amount, toAmount: input.amount }
              : {}),
          },
        });
        return scope.version.id;
      });
      return loadVersion(db, projectId, versionId, currency);
    },

    async deleteLineItem(
      projectId: string,
      lineItemId: string,
      expectedVersion: number,
      actor: BudgetActor,
    ): Promise<BudgetVersion> {
      const currency = requireBudget(
        await budgetRepository.findByProject(db, projectId),
      ).budget.currency;
      const versionId = await withTransaction(db, async (tx) => {
        const scope = await budgetLineItemRepository.findScoped(tx, {
          projectId,
          lineItemId,
        });
        if (!scope)
          throw new ApiError(
            404,
            "BUDGET_LINE_ITEM_NOT_FOUND",
            "The line item was not found.",
          );
        await requireEditableDepartment(tx, projectId, scope.department.id);
        requireFresh(
          (await budgetLineItemRepository.delete(tx, {
            id: lineItemId,
            expectedVersion,
          })) || undefined,
        );
        await budgetVersionRepository.touch(tx, scope.version.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget_line_item.deleted",
          entityType: "budget_line_item",
          entityId: lineItemId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            budgetVersionId: scope.version.id,
            name: scope.lineItem.name,
            amount: scope.lineItem.amount,
          },
        });
        return scope.version.id;
      });
      return loadVersion(db, projectId, versionId, currency);
    },

    async attachNewDocument(
      projectId: string,
      departmentId: string,
      input: AttachNewOwnerDocumentInput,
      actor: BudgetActor,
    ): Promise<BudgetVersion> {
      const currency = requireBudget(
        await budgetRepository.findByProject(db, projectId),
      ).budget.currency;
      const versionId = await withTransaction(db, async (tx) => {
        const scope = await requireEditableDepartment(
          tx,
          projectId,
          departmentId,
        );
        const document: Document = await createDocumentInTransaction(tx, {
          projectId,
          document: { ...input, folder: BUDGET_FOLDER },
          actor,
        });
        await attach(
          tx,
          {
            projectId,
            departmentId,
            versionId: scope.version.id,
            documentLineageId: document.lineageId,
          },
          actor,
        );
        return scope.version.id;
      });
      return loadVersion(db, projectId, versionId, currency);
    },

    async attachExistingDocument(
      projectId: string,
      departmentId: string,
      documentId: string,
      actor: BudgetActor,
    ): Promise<BudgetVersion> {
      const currency = requireBudget(
        await budgetRepository.findByProject(db, projectId),
      ).budget.currency;
      const versionId = await withTransaction(db, async (tx) => {
        const scope = await requireEditableDepartment(
          tx,
          projectId,
          departmentId,
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
        const already = await budgetDepartmentDocumentRepository.find(tx, {
          ownerId: departmentId,
          documentLineageId: document.document.lineageId,
        });
        if (already)
          throw new ApiError(
            409,
            "DOCUMENT_ALREADY_ATTACHED",
            "That document is already attached.",
          );
        await attach(
          tx,
          {
            projectId,
            departmentId,
            versionId: scope.version.id,
            documentLineageId: document.document.lineageId,
          },
          actor,
        );
        return scope.version.id;
      });
      return loadVersion(db, projectId, versionId, currency);
    },

    async detachDocument(
      projectId: string,
      departmentId: string,
      documentId: string,
      actor: BudgetActor,
    ): Promise<BudgetVersion> {
      const currency = requireBudget(
        await budgetRepository.findByProject(db, projectId),
      ).budget.currency;
      const versionId = await withTransaction(db, async (tx) => {
        const scope = await requireEditableDepartment(
          tx,
          projectId,
          departmentId,
        );
        const document = await documentRepository.findById(tx, {
          projectId,
          documentId,
        });
        const lineageId = document?.document.lineageId ?? documentId;
        const removed = await budgetDepartmentDocumentRepository.delete(tx, {
          ownerId: departmentId,
          documentLineageId: lineageId,
        });
        if (!removed)
          throw new ApiError(
            404,
            "ATTACHMENT_NOT_FOUND",
            "That document is not attached here.",
          );
        await budgetVersionRepository.touch(tx, scope.version.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "budget_department.document_detached",
          entityType: "budget_department",
          entityId: departmentId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            budgetVersionId: scope.version.id,
            documentLineageId: lineageId,
          },
        });
        return scope.version.id;
      });
      return loadVersion(db, projectId, versionId, currency);
    },
  };
}

export type BudgetService = ReturnType<typeof createBudgetService>;

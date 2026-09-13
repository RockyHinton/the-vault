import {
  summarizeFinancing,
  type AttachNewOwnerDocumentInput,
  type ChangeFinanceSourceStatusInput,
  type CreateFinancePlanInput,
  type CreateFinanceSourceInput,
  type FinancePlan,
  type FinanceSource,
  type RebaseFinancePlanInput,
  type UpdateFinanceSourceInput,
} from "@shared/contracts";
import type { Database } from "../../db/client";
import { withTransaction, type Transaction } from "../../db/transaction";
import { ApiError } from "../../http/errors";
import { withUniqueViolationAsConflict } from "../../db/unique-violation";
import { appendAuditEvent } from "../audit/audit-repository";
import {
  budgetLineItemRepository,
  budgetVersionRepository,
} from "../budget/budget-repository";
import { documentRepository } from "../documents/document-repository";
import { createDocumentInTransaction } from "../documents/document-service";
import { projectRepository } from "../projects/project-repository";
import { toUserRef } from "../users/user-ref";
import {
  financePlanRepository,
  financeSourceDocumentRepository,
  financeSourceRepository,
  type FinancePlanRecord,
  type FinanceSourceEditableFields,
  type FinanceSourceRecord,
} from "./finance-plan-repository";

export interface FinanceActor {
  userId: string;
  role: "studio_admin" | "user";
  requestId: string;
}

/** Supporting documents are filed in the workspace's Finance Plan folder. */
const PLAN_FOLDER = "financing/finance-plan" as const;
const ZERO = "0.00";

function toSource(
  record: FinanceSourceRecord,
  documents: FinanceSource["documents"],
): FinanceSource {
  const { source, createdBy, approvedBy } = record;
  return {
    id: source.id,
    financePlanId: source.financePlanId,
    name: source.name,
    type: source.type,
    amount: source.amount,
    status: source.status,
    expectedDate: source.expectedDate,
    notes: source.notes,
    position: source.position,
    documents,
    createdBy: toUserRef(createdBy),
    approvedBy: approvedBy ? toUserRef(approvedBy) : null,
    approvedAt: source.approvedAt?.toISOString() ?? null,
    version: source.version,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function requirePlan(record: FinancePlanRecord | undefined): FinancePlanRecord {
  if (!record)
    throw new ApiError(
      404,
      "FINANCE_PLAN_NOT_FOUND",
      "This project has no finance plan yet.",
    );
  return record;
}

function requireFresh<T>(row: T | undefined): T {
  if (!row)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "The finance plan changed while you were editing. Refresh and try again.",
    );
  return row;
}

/** Approved sources are permanent financial facts: no edits, no status change, no removal. */
function assertNotApproved(record: FinanceSourceRecord): void {
  if (record.source.status === "approved")
    throw new ApiError(
      409,
      "FINANCE_SOURCE_APPROVED",
      "This source is approved and locked; it can no longer be changed.",
    );
}

/**
 * Re-pointing the plan at another locked budget version changes the financial
 * baseline of the plan and of the cash flow built on it, the same class of
 * decision as locking a budget: studio administrators only.
 */
function assertCanRebase(actor: FinanceActor): void {
  if (actor.role !== "studio_admin")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only a studio administrator can change the budget version a finance plan is based on.",
    );
}

/** Approving financing is a sign-off: studio administrators only. */
function assertCanApprove(actor: FinanceActor): void {
  if (actor.role !== "studio_admin")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only a studio administrator can approve a financing source.",
    );
}

/** Removing an unapproved source follows the authored-record rule. */
function assertCanRemove(
  actor: FinanceActor,
  record: FinanceSourceRecord,
): void {
  if (actor.role === "studio_admin") return;
  if (record.source.createdByUserId === actor.userId) return;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the user who added this source or a studio administrator can remove it.",
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
 * The provenance rule: a plan finances one exact, locked budget version of
 * its own project. Anything else answers a stable policy error.
 */
async function requireLockedBudgetVersion(
  executor: Transaction | Database,
  projectId: string,
  budgetVersionId: string,
) {
  const version = await budgetVersionRepository.findById(executor, {
    projectId,
    versionId: budgetVersionId,
  });
  if (!version)
    throw new ApiError(
      404,
      "BUDGET_VERSION_NOT_FOUND",
      "The budget version was not found in this project.",
    );
  if (version.version.status !== "locked")
    throw new ApiError(
      422,
      "BUDGET_VERSION_NOT_LOCKED",
      "A finance plan is based on a locked budget version. Lock the budget first.",
    );
  return version;
}

const blankToNull = (value: string | null | undefined) =>
  value === undefined ? undefined : value || null;

/**
 * Finance Plan use-cases. One living register of sources per project, based
 * on an exact locked budget version. Any active user records, edits and moves
 * unapproved sources and attaches documents; a studio_admin approves, which
 * freezes the source forever; removal of unapproved sources is
 * creator-or-admin. Totals are the shared `summarizeFinancing` result.
 */
export function createFinancePlanService({ db }: { db: Database }) {
  async function load(
    executor: Transaction | Database,
    projectId: string,
  ): Promise<FinancePlan> {
    const record = requirePlan(
      await financePlanRepository.findByProject(executor, projectId),
    );
    const [sources, budgetTotals] = await Promise.all([
      financeSourceRepository.listByPlan(executor, record.plan.id),
      budgetLineItemRepository.totalsByVersion(executor, [
        record.plan.budgetVersionId,
      ]),
    ]);
    const documents =
      await financeSourceDocumentRepository.loadDocumentsByOwner(executor, {
        projectId,
        ownerIds: sources.map((s) => s.source.id),
      });
    const contractSources = sources.map((s) =>
      toSource(s, documents.get(s.source.id) ?? []),
    );
    return {
      id: record.plan.id,
      projectId,
      budgetVersionId: record.plan.budgetVersionId,
      budgetVersionNumber: record.budgetVersionNumber,
      currency: record.currency,
      summary: summarizeFinancing({
        budgetTotal: budgetTotals.get(record.plan.budgetVersionId) ?? ZERO,
        sources: contractSources,
      }),
      sources: contractSources,
      createdBy: toUserRef(record.createdBy),
      version: record.plan.version,
      createdAt: record.plan.createdAt.toISOString(),
      updatedAt: record.plan.updatedAt.toISOString(),
    };
  }

  /** Resolves a source for a mutating command: project-scoped, plan row-locked. */
  async function requireScopedSource(
    tx: Transaction,
    projectId: string,
    sourceId: string,
  ) {
    const record = await financeSourceRepository.findScoped(tx, {
      projectId,
      sourceId,
    });
    if (!record)
      throw new ApiError(
        404,
        "FINANCE_SOURCE_NOT_FOUND",
        "The financing source was not found.",
      );
    await financePlanRepository.lockRow(tx, record.source.financePlanId);
    return record;
  }

  async function attach(
    tx: Transaction,
    input: {
      projectId: string;
      source: FinanceSourceRecord;
      documentLineageId: string;
    },
    actor: FinanceActor,
  ) {
    await financeSourceDocumentRepository.insert(tx, {
      ownerId: input.source.source.id,
      documentLineageId: input.documentLineageId,
      attachedByUserId: actor.userId,
    });
    await financePlanRepository.touch(tx, input.source.source.financePlanId);
    await appendAuditEvent(tx, {
      actorUserId: actor.userId,
      action: "finance_source.document_attached",
      entityType: "finance_source",
      entityId: input.source.source.id,
      requestId: actor.requestId,
      metadata: {
        projectId: input.projectId,
        documentLineageId: input.documentLineageId,
      },
    });
  }

  return {
    async get(projectId: string): Promise<FinancePlan> {
      await requireProject(db, projectId);
      return load(db, projectId);
    },

    async create(
      projectId: string,
      input: CreateFinancePlanInput,
      actor: FinanceActor,
    ): Promise<FinancePlan> {
      const planExists = () =>
        new ApiError(
          409,
          "FINANCE_PLAN_EXISTS",
          "This project already has a finance plan.",
        );
      await withUniqueViolationAsConflict(
        "finance_plans_project_unique",
        planExists,
        () =>
          withTransaction(db, async (tx) => {
            await requireProject(tx, projectId);
            if (await financePlanRepository.findByProject(tx, projectId))
              throw planExists();
            const budgetVersion = await requireLockedBudgetVersion(
              tx,
              projectId,
              input.budgetVersionId,
            );
            const plan = await financePlanRepository.insert(tx, {
              projectId,
              budgetVersionId: input.budgetVersionId,
              createdByUserId: actor.userId,
            });
            await appendAuditEvent(tx, {
              actorUserId: actor.userId,
              action: "finance_plan.created",
              entityType: "finance_plan",
              entityId: plan.id,
              requestId: actor.requestId,
              metadata: {
                projectId,
                budgetVersionId: input.budgetVersionId,
                budgetVersionNumber: budgetVersion.version.versionNumber,
              },
            });
          }),
      );
      return load(db, projectId);
    },

    /** Points the plan at another locked budget version; sources are untouched. */
    async rebase(
      projectId: string,
      input: RebaseFinancePlanInput,
      actor: FinanceActor,
    ): Promise<FinancePlan> {
      assertCanRebase(actor);
      await withTransaction(db, async (tx) => {
        const plan = requirePlan(
          await financePlanRepository.findByProject(tx, projectId),
        );
        const target = await requireLockedBudgetVersion(
          tx,
          projectId,
          input.budgetVersionId,
        );
        if (plan.plan.budgetVersionId === input.budgetVersionId)
          throw new ApiError(
            409,
            "BUDGET_VERSION_UNCHANGED",
            "The plan already finances that budget version.",
          );
        requireFresh(
          await financePlanRepository.rebase(tx, {
            id: plan.plan.id,
            expectedVersion: input.version,
            budgetVersionId: input.budgetVersionId,
          }),
        );
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "finance_plan.rebased",
          entityType: "finance_plan",
          entityId: plan.plan.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            fromBudgetVersionId: plan.plan.budgetVersionId,
            toBudgetVersionId: input.budgetVersionId,
            toBudgetVersionNumber: target.version.versionNumber,
          },
        });
      });
      return load(db, projectId);
    },

    async createSource(
      projectId: string,
      input: CreateFinanceSourceInput,
      actor: FinanceActor,
    ): Promise<FinancePlan> {
      await withTransaction(db, async (tx) => {
        const plan = requirePlan(
          await financePlanRepository.findByProject(tx, projectId),
        );
        await financePlanRepository.lockRow(tx, plan.plan.id);
        const created = await financeSourceRepository.insert(tx, {
          financePlanId: plan.plan.id,
          name: input.name,
          type: input.type,
          amount: input.amount,
          status: input.status,
          expectedDate: input.expectedDate ?? null,
          notes: input.notes || null,
          position: await financeSourceRepository.nextPosition(
            tx,
            plan.plan.id,
          ),
          createdByUserId: actor.userId,
        });
        await financePlanRepository.touch(tx, plan.plan.id);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "finance_source.created",
          entityType: "finance_source",
          entityId: created.id,
          requestId: actor.requestId,
          metadata: {
            projectId,
            type: input.type,
            status: input.status,
            amount: input.amount,
          },
        });
      });
      return load(db, projectId);
    },

    async updateSource(
      projectId: string,
      sourceId: string,
      input: UpdateFinanceSourceInput,
      actor: FinanceActor,
    ): Promise<FinancePlan> {
      const values: FinanceSourceEditableFields = {
        name: input.name,
        type: input.type,
        amount: input.amount,
        expectedDate: input.expectedDate,
        notes: blankToNull(input.notes),
      };
      const changedFields = (
        Object.keys(values) as (keyof FinanceSourceEditableFields)[]
      ).filter((key) => values[key] !== undefined);
      await withTransaction(db, async (tx) => {
        const existing = await requireScopedSource(tx, projectId, sourceId);
        assertNotApproved(existing);
        requireFresh(
          await financeSourceRepository.updateFields(tx, {
            id: sourceId,
            expectedVersion: input.version,
            values,
          }),
        );
        await financePlanRepository.touch(tx, existing.source.financePlanId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "finance_source.updated",
          entityType: "finance_source",
          entityId: sourceId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            changedFields,
            ...(input.amount !== undefined
              ? { fromAmount: existing.source.amount, toAmount: input.amount }
              : {}),
          },
        });
      });
      return load(db, projectId);
    },

    /** Targeted ⇄ soft committed. Approval is its own command. */
    async changeSourceStatus(
      projectId: string,
      sourceId: string,
      input: ChangeFinanceSourceStatusInput,
      actor: FinanceActor,
    ): Promise<FinancePlan> {
      await withTransaction(db, async (tx) => {
        const existing = await requireScopedSource(tx, projectId, sourceId);
        assertNotApproved(existing);
        if (existing.source.status === input.status)
          throw new ApiError(
            409,
            "STATUS_UNCHANGED",
            "The source already has that status.",
          );
        requireFresh(
          await financeSourceRepository.changeStatus(tx, {
            id: sourceId,
            expectedVersion: input.version,
            status: input.status,
          }),
        );
        await financePlanRepository.touch(tx, existing.source.financePlanId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "finance_source.status_changed",
          entityType: "finance_source",
          entityId: sourceId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            from: existing.source.status,
            to: input.status,
            amount: existing.source.amount,
          },
        });
      });
      return load(db, projectId);
    },

    /** Irreversible: records the approver and time and freezes the source. studio_admin only. */
    async approveSource(
      projectId: string,
      sourceId: string,
      expectedVersion: number,
      actor: FinanceActor,
    ): Promise<FinancePlan> {
      assertCanApprove(actor);
      await withTransaction(db, async (tx) => {
        const existing = await requireScopedSource(tx, projectId, sourceId);
        assertNotApproved(existing);
        requireFresh(
          await financeSourceRepository.approve(tx, {
            id: sourceId,
            expectedVersion,
            approvedByUserId: actor.userId,
            at: new Date(),
          }),
        );
        await financePlanRepository.touch(tx, existing.source.financePlanId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "finance_source.approved",
          entityType: "finance_source",
          entityId: sourceId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            from: existing.source.status,
            amount: existing.source.amount,
          },
        });
      });
      return load(db, projectId);
    },

    async deleteSource(
      projectId: string,
      sourceId: string,
      expectedVersion: number,
      actor: FinanceActor,
    ): Promise<FinancePlan> {
      await withTransaction(db, async (tx) => {
        const existing = await requireScopedSource(tx, projectId, sourceId);
        assertNotApproved(existing);
        assertCanRemove(actor, existing);
        requireFresh(
          (await financeSourceRepository.delete(tx, {
            id: sourceId,
            expectedVersion,
          })) || undefined,
        );
        await financePlanRepository.touch(tx, existing.source.financePlanId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "finance_source.deleted",
          entityType: "finance_source",
          entityId: sourceId,
          requestId: actor.requestId,
          metadata: {
            projectId,
            name: existing.source.name,
            amount: existing.source.amount,
          },
        });
      });
      return load(db, projectId);
    },

    async attachNewDocument(
      projectId: string,
      sourceId: string,
      input: AttachNewOwnerDocumentInput,
      actor: FinanceActor,
    ): Promise<FinancePlan> {
      await withTransaction(db, async (tx) => {
        const existing = await requireScopedSource(tx, projectId, sourceId);
        const document = await createDocumentInTransaction(tx, {
          projectId,
          document: { ...input, folder: PLAN_FOLDER },
          actor,
        });
        await attach(
          tx,
          {
            projectId,
            source: existing,
            documentLineageId: document.lineageId,
          },
          actor,
        );
      });
      return load(db, projectId);
    },

    async attachExistingDocument(
      projectId: string,
      sourceId: string,
      documentId: string,
      actor: FinanceActor,
    ): Promise<FinancePlan> {
      await withTransaction(db, async (tx) => {
        const existing = await requireScopedSource(tx, projectId, sourceId);
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
        const already = await financeSourceDocumentRepository.find(tx, {
          ownerId: sourceId,
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
            source: existing,
            documentLineageId: document.document.lineageId,
          },
          actor,
        );
      });
      return load(db, projectId);
    },

    /** Detaching is creator-or-admin, and never from an approved source. */
    async detachDocument(
      projectId: string,
      sourceId: string,
      documentId: string,
      actor: FinanceActor,
    ): Promise<FinancePlan> {
      await withTransaction(db, async (tx) => {
        const existing = await requireScopedSource(tx, projectId, sourceId);
        assertNotApproved(existing);
        assertCanRemove(actor, existing);
        const document = await documentRepository.findById(tx, {
          projectId,
          documentId,
        });
        const lineageId = document?.document.lineageId ?? documentId;
        const removed = await financeSourceDocumentRepository.delete(tx, {
          ownerId: sourceId,
          documentLineageId: lineageId,
        });
        if (!removed)
          throw new ApiError(
            404,
            "ATTACHMENT_NOT_FOUND",
            "That document is not attached here.",
          );
        await financePlanRepository.touch(tx, existing.source.financePlanId);
        await appendAuditEvent(tx, {
          actorUserId: actor.userId,
          action: "finance_source.document_detached",
          entityType: "finance_source",
          entityId: sourceId,
          requestId: actor.requestId,
          metadata: { projectId, documentLineageId: lineageId },
        });
      });
      return load(db, projectId);
    },
  };
}

export type FinancePlanService = ReturnType<typeof createFinancePlanService>;

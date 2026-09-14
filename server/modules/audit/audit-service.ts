import type { z } from "zod";
import type { AuditEvent, auditListQuerySchema } from "@shared/contracts";
import type { Database } from "../../db/client";
import { listAuditEvents, type AuditEventRecord } from "./audit-repository";

type AuditListQuery = z.infer<typeof auditListQuerySchema>;

function toContract(record: AuditEventRecord): AuditEvent {
  return {
    id: record.id,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    actor: record.actor,
    requestId: record.requestId,
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : {},
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Reading the audit trail. Writing it is not a service concern: every command
 * appends its own event with `appendAuditEvent` inside its own transaction.
 * Access is studio_admin only, enforced where the router is mounted.
 */
export function createAuditService({ db }: { db: Database }) {
  return {
    /** Newest first, keyset-paginated; `nextCursor` is null on the last page. */
    async list(
      query: AuditListQuery,
    ): Promise<{ items: AuditEvent[]; nextCursor: string | null }> {
      // One extra row tells us whether a next page exists.
      const rows = await listAuditEvents(db, {
        ...query,
        limit: query.limit + 1,
      });
      const items = rows.slice(0, query.limit).map(toContract);
      return {
        items,
        nextCursor:
          rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
      };
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;

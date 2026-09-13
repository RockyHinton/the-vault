import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { applicationUsers, auditEvents } from "@shared/schema";
import type { DatabaseExecutor } from "../../db/transaction";
import type { AuditAction } from "./audit-actions";

/**
 * Append-only audit trail. This is the only code path that writes
 * `audit_events`; domain services call it with the transaction that carries
 * the state change so the event and the change commit or roll back together.
 */
export interface AuditEventInput {
  /** Local application user performing the action; null for system actions. */
  actorUserId: string | null;
  /** One of the canonical names in `audit-actions.ts`, e.g. `project.archived`. */
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  requestId: string;
  metadata?: Record<string, unknown>;
}

export async function appendAuditEvent(
  executor: DatabaseExecutor,
  event: AuditEventInput,
): Promise<void> {
  await executor.insert(auditEvents).values({
    actorUserId: event.actorUserId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    requestId: event.requestId,
    metadata: event.metadata ?? {},
  });
}

export interface AuditEventRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string;
  metadata: unknown;
  createdAt: Date;
  actor: {
    id: string;
    displayName: string | null;
    email: string | null;
  } | null;
}

/**
 * Newest first, keyset-paginated on (created_at, id). The cursor is the id of
 * the last row seen; rows strictly older than it are returned.
 */
export async function listAuditEvents(
  executor: DatabaseExecutor,
  input: {
    limit: number;
    cursor?: string;
    entityType?: string;
    entityId?: string;
  },
): Promise<AuditEventRecord[]> {
  const filters: SQL[] = [];
  if (input.entityType)
    filters.push(eq(auditEvents.entityType, input.entityType));
  if (input.entityId) filters.push(eq(auditEvents.entityId, input.entityId));
  if (input.cursor) {
    filters.push(
      sql`(${auditEvents.createdAt}, ${auditEvents.id}) < (select ${auditEvents.createdAt}, ${auditEvents.id} from ${auditEvents} where ${auditEvents.id} = ${input.cursor})`,
    );
  }
  const rows = await executor
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      requestId: auditEvents.requestId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      actorId: applicationUsers.id,
      actorDisplayName: applicationUsers.displayName,
      actorEmail: applicationUsers.email,
    })
    .from(auditEvents)
    .leftJoin(
      applicationUsers,
      eq(auditEvents.actorUserId, applicationUsers.id),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(input.limit);
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    requestId: row.requestId,
    metadata: row.metadata,
    createdAt: row.createdAt,
    actor: row.actorId
      ? {
          id: row.actorId,
          displayName: row.actorDisplayName,
          email: row.actorEmail,
        }
      : null,
  }));
}

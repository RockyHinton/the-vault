import { auditEvents } from "@shared/schema";
import type { DatabaseExecutor } from "../../db/transaction";

/**
 * Append-only audit trail. This is the only code path that writes
 * `audit_events`; domain services call it with the transaction that carries
 * the state change so the event and the change commit or roll back together.
 */
export interface AuditEventInput {
  /** Local application user performing the action; null for system actions. */
  actorUserId: string | null;
  /** Dot-namespaced verb, e.g. `project.archived`, `user.bootstrap_admin_created`. */
  action: string;
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

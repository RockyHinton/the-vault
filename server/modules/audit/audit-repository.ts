import { auditEvents } from "@shared/schema";

type DatabaseExecutor = {
  insert: (table: typeof auditEvents) => {
    values: (values: typeof auditEvents.$inferInsert) => Promise<unknown>;
  };
};

export async function appendAuditEvent(
  db: DatabaseExecutor,
  event: typeof auditEvents.$inferInsert,
): Promise<void> {
  await db.insert(auditEvents).values(event);
}

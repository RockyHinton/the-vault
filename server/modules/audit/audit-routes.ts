import { Router } from "express";
import { auditListQuerySchema, type AuditEvent } from "@shared/contracts";
import type { Database } from "../../db/client";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import { requireStudioAdmin } from "../auth/auth-service";
import { listAuditEvents, type AuditEventRecord } from "./audit-repository";

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

/** `/api/v1/audit-events`: read-only, studio_admin only, newest first. */
export function createAuditRouter(db: Database): Router {
  const router = Router();
  router.use(requireStudioAdmin);

  router.get(
    "/",
    handle(async (req, res) => {
      const query = validate(auditListQuerySchema, req.query);
      // One extra row tells us whether a next page exists.
      const rows = await listAuditEvents(db, {
        ...query,
        limit: query.limit + 1,
      });
      const items = rows.slice(0, query.limit).map(toContract);
      res.json({
        data: {
          items,
          nextCursor:
            rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
        },
        requestId: req.requestId,
      });
    }),
  );

  return router;
}

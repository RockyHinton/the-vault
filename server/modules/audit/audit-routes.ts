import { Router } from "express";
import { auditListQuerySchema } from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import { requireStudioAdmin } from "../auth/auth-service";
import type { AuditService } from "./audit-service";

/** `/api/v1/audit-events`: read-only, studio_admin only, newest first. */
export function createAuditRouter(service: AuditService): Router {
  const router = Router();
  router.use(requireStudioAdmin);

  router.get(
    "/",
    handle(async (req, res) => {
      const query = validate(auditListQuerySchema, req.query);
      res.json({ data: await service.list(query), requestId: req.requestId });
    }),
  );

  return router;
}

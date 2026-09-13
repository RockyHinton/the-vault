import { Router, type Request } from "express";
import {
  changeUserRoleSchema,
  provisionUserSchema,
  reinstateUserSchema,
  suspendUserSchema,
  userListQuerySchema,
} from "@shared/contracts";
import { z } from "zod";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import { requireStudioAdmin } from "../auth/auth-service";
import type { Actor, UserService } from "./user-service";

const userIdParamSchema = z.object({ userId: z.string().uuid() });

/** `/api/v1/users`. Mounted behind requireLocalUser; everything except the directory is studio_admin only. */
export function createUserRouter(service: UserService): Router {
  const router = Router();

  // Any active user may see who can be assigned or addressed; nothing else.
  router.get(
    "/directory",
    handle(async (req, res) => {
      const items = await service.directory();
      res.json({ data: { items }, requestId: req.requestId });
    }),
  );

  router.use(requireStudioAdmin);
  const userId = (req: Request) =>
    validate(userIdParamSchema, req.params).userId;
  const actor = (req: Request): Actor => ({
    userId: req.localUser!.id,
    requestId: req.requestId,
  });

  router.get(
    "/",
    handle(async (req, res) => {
      const users = await service.list(
        validate(userListQuerySchema, req.query),
      );
      res.json({ data: { items: users }, requestId: req.requestId });
    }),
  );

  router.post(
    "/",
    handle(async (req, res) => {
      const user = await service.provision(
        validate(provisionUserSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: user, requestId: req.requestId });
    }),
  );

  router.post(
    "/:userId/role",
    handle(async (req, res) => {
      const user = await service.changeRole(
        userId(req),
        validate(changeUserRoleSchema, req.body),
        actor(req),
      );
      res.json({ data: user, requestId: req.requestId });
    }),
  );

  router.post(
    "/:userId/suspend",
    handle(async (req, res) => {
      const { version } = validate(suspendUserSchema, req.body);
      const user = await service.suspend(userId(req), version, actor(req));
      res.json({ data: user, requestId: req.requestId });
    }),
  );

  router.post(
    "/:userId/reinstate",
    handle(async (req, res) => {
      const { version } = validate(reinstateUserSchema, req.body);
      const user = await service.reinstate(userId(req), version, actor(req));
      res.json({ data: user, requestId: req.requestId });
    }),
  );

  return router;
}

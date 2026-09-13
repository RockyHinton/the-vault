import { Router, type Request } from "express";
import {
  createNoteSchema,
  deleteNoteSchema,
  noteIdParamSchema,
  projectIdParamSchema,
  updateNoteSchema,
} from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { NoteActor, NoteService } from "./note-service";

/** `/api/v1/projects/:projectId/notes`. Mounted behind `requireLocalUser`. */
export function createNoteRouter(service: NoteService): Router {
  const router = Router({ mergeParams: true });
  const projectId = (req: Request) =>
    validate(projectIdParamSchema, req.params).projectId;
  const ids = (req: Request) => validate(noteIdParamSchema, req.params);
  const actor = (req: Request): NoteActor => ({
    userId: req.localUser!.id,
    role: req.localUser!.role,
    requestId: req.requestId,
  });

  router.get(
    "/",
    handle(async (req, res) => {
      const items = await service.list(projectId(req));
      res.json({ data: { items }, requestId: req.requestId });
    }),
  );

  router.post(
    "/",
    handle(async (req, res) => {
      const note = await service.create(
        projectId(req),
        validate(createNoteSchema, req.body),
        actor(req),
      );
      res.status(201).json({ data: note, requestId: req.requestId });
    }),
  );

  router.patch(
    "/:noteId",
    handle(async (req, res) => {
      const params = ids(req);
      const note = await service.update(
        params.projectId,
        params.noteId,
        validate(updateNoteSchema, req.body),
        actor(req),
      );
      res.json({ data: note, requestId: req.requestId });
    }),
  );

  router.delete(
    "/:noteId",
    handle(async (req, res) => {
      const params = ids(req);
      const { version } = validate(deleteNoteSchema, req.body);
      await service.delete(
        params.projectId,
        params.noteId,
        version,
        actor(req),
      );
      res.status(204).end();
    }),
  );

  return router;
}

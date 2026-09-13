import { Router, type Request } from "express";
import { fileContentQuerySchema, fileIdParamSchema } from "@shared/contracts";
import { handle } from "../../http/handler";
import { validate } from "../../http/validation";
import type { FileActor, FileService } from "./file-service";
import { contentDisposition, isInlineSafe } from "./media-types";

export const FILENAME_HEADER = "x-vault-filename";

const actor = (req: Request): FileActor => ({
  userId: req.localUser!.id,
  role: req.localUser!.role,
  requestId: req.requestId,
});

/**
 * `/api/v1/files`. Upload is a raw streamed body (no multipart): the bytes go
 * straight through inspection into storage. Download streams back through
 * the app after authorization; there are no public or signed URLs.
 */
export function createFileRouter(service: FileService): Router {
  const router = Router();

  router.post(
    "/",
    handle(async (req, res) => {
      const declaredFilename = req.header(FILENAME_HEADER);
      const length = Number(req.header("content-length"));
      const file = await service.stageUpload(
        {
          source: req,
          declaredFilename: declaredFilename
            ? decodeURIComponent(declaredFilename)
            : undefined,
          declaredLength: Number.isFinite(length) ? length : undefined,
        },
        actor(req),
      );
      res.status(201).json({ data: file, requestId: req.requestId });
    }),
  );

  router.get(
    "/:fileId/content",
    handle(async (req, res) => {
      const { fileId } = validate(fileIdParamSchema, req.params);
      const query = validate(fileContentQuerySchema, req.query);
      const { file, stream } = await service.openForRead(fileId, actor(req));
      const disposition =
        query.disposition === "inline" && isInlineSafe(file.mediaType)
          ? "inline"
          : "attachment";
      res.status(200);
      res.setHeader("Content-Type", file.mediaType);
      res.setHeader("Content-Length", String(file.byteSize));
      res.setHeader(
        "Content-Disposition",
        contentDisposition(disposition, file.originalFilename),
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      // Even inline-safe types run with no scripts and no network.
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    }),
  );

  return router;
}

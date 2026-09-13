import { apiSuccessSchema, fileObjectSchema } from "@shared/contracts";
import { apiUpload } from "@/lib/api-client";

/** Stages a file's bytes; the returned file object is claimed by a document command. */
export const uploadFile = (file: File) =>
  apiUpload("/files", file, apiSuccessSchema(fileObjectSchema));

/**
 * Authenticated content URL. The server streams the bytes after checking the
 * session; there is no public or signed URL. `inline` is honoured only for
 * types the server considers safe to render.
 */
export const fileContentUrl = (
  fileId: string,
  disposition: "attachment" | "inline" = "attachment",
) => `/api/v1/files/${fileId}/content?disposition=${disposition}`;

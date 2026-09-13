import { apiSuccessSchema, auditEventSchema } from "@shared/contracts";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const auditListResponse = apiSuccessSchema(
  z.object({
    items: z.array(auditEventSchema),
    nextCursor: z.string().uuid().nullable(),
  }),
);

export const listAuditEvents = (cursor?: string, limit = 50) =>
  apiClient(
    "GET",
    `/audit-events?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    auditListResponse,
  );

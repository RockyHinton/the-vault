import { z } from "zod";

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});

export const apiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data, requestId: z.string() });

export const projectStageSchema = z.enum([
  "evaluation",
  "development",
  "production",
]);
export type ProjectStage = z.infer<typeof projectStageSchema>;

export const archiveReasonSchema = z.enum([
  "creative_pass",
  "commercial_viability",
  "financing_not_secured",
  "rights_legal_issues",
  "packaging_fell_through",
  "paused_strategic_timing",
  "produced_completed",
  "withdrawn",
]);
export type ArchiveReason = z.infer<typeof archiveReasonSchema>;

export const revisitDispositionSchema = z.enum(["yes", "maybe", "no"]);

export const projectSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  logline: z.string().nullable(),
  synopsis: z.string().nullable(),
  genre: z.string().nullable(),
  stage: projectStageSchema,
  archivedAt: z.string().datetime().nullable(),
  archive: z
    .object({
      reason: archiveReasonSchema,
      revisit: revisitDispositionSchema,
      starred: z.boolean(),
      notes: z.string().nullable(),
      archivedFromStage: projectStageSchema,
    })
    .nullable(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectListQuerySchema = z.object({
  archived: z.enum(["true", "false", "all"]).default("false"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});
export const projectIdParamSchema = z.object({ projectId: z.string().uuid() });

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(180),
  logline: z.string().trim().max(1_000).optional(),
  synopsis: z.string().trim().max(20_000).optional(),
  genre: z.string().trim().max(120).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema
  .omit({ title: true })
  .extend({
    title: z.string().trim().min(1).max(180).optional(),
    logline: z.string().trim().max(1_000).nullable().optional(),
    synopsis: z.string().trim().max(20_000).nullable().optional(),
    genre: z.string().trim().max(120).nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one project field must be supplied.",
  });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const transitionProjectStageSchema = z.object({
  toStage: projectStageSchema,
  version: z.number().int().positive(),
  note: z.string().trim().max(1_000).optional(),
});

export const archiveProjectSchema = z.object({
  reason: archiveReasonSchema,
  revisit: revisitDispositionSchema,
  starred: z.boolean(),
  notes: z.string().trim().max(2_000).optional(),
  version: z.number().int().positive(),
});

export const restoreProjectSchema = z.object({
  version: z.number().int().positive(),
});

export const deleteProjectSchema = z.object({
  version: z.number().int().positive(),
});

export const localUserSchema = z.object({
  id: z.string().uuid(),
  clerkUserId: z.string(),
  email: z.string().email().nullable(),
  displayName: z.string().nullable(),
  role: z.enum(["studio_admin", "user"]),
  status: z.enum(["active", "suspended"]),
});
export type LocalUser = z.infer<typeof localUserSchema>;

export const meSchema = z.object({ user: localUserSchema });

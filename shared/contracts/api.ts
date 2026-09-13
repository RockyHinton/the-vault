import { z } from "zod";
import { rightsStatusValues } from "./rights-status";

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

export const applicationRoleSchema = z.enum(["studio_admin", "user"]);
export type ApplicationRole = z.infer<typeof applicationRoleSchema>;
export const userStatusSchema = z.enum(["active", "suspended"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

/** The signed-in caller, as returned by GET /auth/me and POST /auth/login. */
export const localUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: applicationRoleSchema,
  status: userStatusSchema,
});
export type LocalUser = z.infer<typeof localUserSchema>;

export const meSchema = z.object({ user: localUserSchema });

/** Password rules apply wherever a password is set (bootstrap, provisioning). */
export const passwordSchema = z.string().min(12).max(256);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

// --- Users & Access (studio_admin only) ---

/** A Vault user as managed by administrators. Never carries credentials. */
export const vaultUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: applicationRoleSchema,
  status: userStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type VaultUser = z.infer<typeof vaultUserSchema>;

export const userListQuerySchema = z.object({
  status: z.enum(["active", "suspended", "all"]).default("all"),
});

/**
 * Admin-provisioned account. The initial password is hashed once and never
 * stored, returned or logged in plain text.
 */
export const provisionUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(1).max(120),
  password: passwordSchema,
  role: applicationRoleSchema.default("user"),
});
export type ProvisionUserInput = z.infer<typeof provisionUserSchema>;

export const changeUserRoleSchema = z.object({
  role: applicationRoleSchema,
  version: z.number().int().positive(),
});
export const suspendUserSchema = z.object({
  version: z.number().int().positive(),
});
export const reinstateUserSchema = suspendUserSchema;

// --- Audit events (studio_admin only, read-only) ---

export const auditActorSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().nullable(),
  email: z.string().email().nullable(),
});

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid().nullable(),
  actor: auditActorSchema.nullable(),
  requestId: z.string().uuid(),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
  entityType: z.string().trim().min(1).max(60).optional(),
  entityId: z.string().uuid().optional(),
});

// --- Files & Documents ---

/** Upload limits shared by client and server. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_FILENAME_LENGTH = 255;

/**
 * Folders mirror the workspace sections. They are configuration, not data:
 * adding a folder is a contract change, validated on both sides.
 */
export const documentFolderSchema = z.enum([
  "general",
  "script",
  "script/reader-analysis",
  "script/cast-wishlist",
  "producers",
  "creatives",
  "underlying-rights",
  "financing/budget",
  "financing/finance-plan",
  "financing/cashflow",
  "legal/chain-of-title",
  "legal/writer-agreements",
  "legal/investment-agreements",
  "legal/co-production",
  "legal/producers-agreements",
  "legal/director-agreements",
  "legal/cast-agreements",
  "legal/banking-docs",
  "legal/funding-tax-credit",
  "legal/sales-agency",
  "legal/cama",
  "distribution",
  "schedules/shooting-schedule",
  "schedules/call-sheets",
]);
export type DocumentFolder = z.infer<typeof documentFolderSchema>;

export const documentStatusSchema = z.enum([
  "draft",
  "under_review",
  "final",
  "signed",
]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

/** Immutable stored bytes. Never carries a storage key or URL. */
export const fileObjectSchema = z.object({
  id: z.string().uuid(),
  originalFilename: z.string(),
  mediaType: z.string(),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
});
export type FileObject = z.infer<typeof fileObjectSchema>;

export const documentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  /** Shared by every version of one document; equals the first version's id. */
  lineageId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  isCurrent: z.boolean(),
  folder: documentFolderSchema,
  title: z.string(),
  status: documentStatusSchema,
  notes: z.string().nullable(),
  file: fileObjectSchema,
  createdBy: auditActorSchema,
  /** Optimistic concurrency for metadata edits and version/delete commands. */
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Document = z.infer<typeof documentSchema>;

export const documentListQuerySchema = z.object({
  folder: documentFolderSchema.optional(),
});
export const documentIdParamSchema = z.object({
  projectId: z.string().uuid(),
  documentId: z.string().uuid(),
});
export const fileIdParamSchema = z.object({ fileId: z.string().uuid() });
export const fileContentQuerySchema = z.object({
  disposition: z.enum(["attachment", "inline"]).default("attachment"),
});

export const createDocumentSchema = z.object({
  fileObjectId: z.string().uuid(),
  folder: documentFolderSchema,
  title: z.string().trim().min(1).max(200),
  status: documentStatusSchema.default("draft"),
  notes: z.string().trim().max(4_000).optional(),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    folder: documentFolderSchema.optional(),
    status: documentStatusSchema.optional(),
    notes: z.string().trim().max(4_000).nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one document field must be supplied.",
  });
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const addDocumentVersionSchema = z.object({
  fileObjectId: z.string().uuid(),
  status: documentStatusSchema.default("draft"),
  notes: z.string().trim().max(4_000).optional(),
  /** The current version's `version` field. */
  version: z.number().int().positive(),
});
export type AddDocumentVersionInput = z.infer<typeof addDocumentVersionSchema>;

export const deleteDocumentSchema = z.object({
  version: z.number().int().positive(),
});

// --- Shared identity reference for authored and assigned records ---

/** Safe human identity for authorship and assignment. Never carries email or role. */
export const userRefSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
});
export type UserRef = z.infer<typeof userRefSchema>;

/** Active users an ordinary user may assign or address. */
export const userDirectorySchema = z.object({ items: z.array(userRefSchema) });

// --- Evaluation ---

export const financeTypeSchema = z.enum([
  "grant",
  "subsidy",
  "equity",
  "loan",
  "pre_sale",
  "deferral",
]);
export type FinanceType = z.infer<typeof financeTypeSchema>;

/** The four go/no-go gates checked before a project is approved for development. */
export const evaluationGatesSchema = z.object({
  scriptApproved: z.boolean(),
  budgetApproved: z.boolean(),
  financeApproved: z.boolean(),
  talentAttached: z.boolean(),
});
export type EvaluationGates = z.infer<typeof evaluationGatesSchema>;

/** One per project. `version: 0` means no evaluation has been saved yet. */
export const evaluationSchema = z.object({
  projectId: z.string().uuid(),
  writer: z.string().nullable(),
  director: z.string().nullable(),
  /** A free-text estimate such as "$5M"; not accounting money (see ADR 0006). */
  plannedBudget: z.string().nullable(),
  financeTypes: z.array(financeTypeSchema),
  gates: evaluationGatesSchema,
  version: z.number().int().nonnegative(),
  updatedBy: userRefSchema.nullable(),
  updatedAt: z.string().datetime().nullable(),
});
export type Evaluation = z.infer<typeof evaluationSchema>;

export const saveEvaluationSchema = z.object({
  writer: z.string().trim().max(200).nullable(),
  director: z.string().trim().max(200).nullable(),
  plannedBudget: z.string().trim().max(80).nullable(),
  financeTypes: z
    .array(financeTypeSchema)
    .max(6)
    .refine((types) => new Set(types).size === types.length, {
      message: "Finance types must be unique.",
    }),
  gates: evaluationGatesSchema,
  /** 0 to create the first evaluation; the current version to update it. */
  version: z.number().int().nonnegative(),
});
export type SaveEvaluationInput = z.infer<typeof saveEvaluationSchema>;

export const reviewRecommendationSchema = z.enum([
  "pass",
  "consider",
  "develop",
]);
export type ReviewRecommendation = z.infer<typeof reviewRecommendationSchema>;

const scoreSchema = z.number().int().min(0).max(10);
export const reviewScoresSchema = z.object({
  script: scoreSchema,
  director: scoreSchema,
  cast: scoreSchema,
  financing: scoreSchema,
});
export type ReviewScores = z.infer<typeof reviewScoresSchema>;

/** One review per project and author; resubmitting replaces the author's own. */
export const reviewSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  author: userRefSchema,
  scores: reviewScoresSchema,
  recommendation: reviewRecommendationSchema,
  summaryNotes: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Review = z.infer<typeof reviewSchema>;

export const submitReviewSchema = z.object({
  scores: reviewScoresSchema,
  summaryNotes: z.string().trim().min(1).max(4_000),
  /** 0 when the author has no review yet; the current version to replace it. */
  version: z.number().int().nonnegative(),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
export const deleteReviewSchema = z.object({
  version: z.number().int().positive(),
});
export const reviewIdParamSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
});

// --- Project notes ---

export const noteCategorySchema = z.enum([
  "script",
  "financing",
  "cast",
  "other",
]);
export type NoteCategory = z.infer<typeof noteCategorySchema>;

export const noteSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  author: userRefSchema,
  body: z.string(),
  category: noteCategorySchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Note = z.infer<typeof noteSchema>;

export const createNoteSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
  category: noteCategorySchema,
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export const updateNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(4_000).optional(),
    category: noteCategorySchema.optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => value.body !== undefined || value.category !== undefined, {
    message: "At least one note field must be supplied.",
  });
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export const deleteNoteSchema = z.object({
  version: z.number().int().positive(),
});
export const noteIdParamSchema = z.object({
  projectId: z.string().uuid(),
  noteId: z.string().uuid(),
});

// --- Project tasks ---

export const taskCategorySchema = z.enum([
  "finance",
  "talent",
  "legal",
  "production",
  "general",
]);
export type TaskCategory = z.infer<typeof taskCategorySchema>;
export const taskPrioritySchema = z.enum(["low", "medium", "high"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export const taskStatusSchema = z.enum(["open", "done"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  category: taskCategorySchema,
  priority: taskPrioritySchema,
  status: taskStatusSchema,
  assignee: userRefSchema.nullable(),
  createdBy: userRefSchema,
  completedAt: z.string().datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Task = z.infer<typeof taskSchema>;

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4_000).optional(),
  category: taskCategorySchema.default("general"),
  priority: taskPrioritySchema.default("medium"),
  assigneeUserId: z.string().uuid().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4_000).nullable().optional(),
    category: taskCategorySchema.optional(),
    priority: taskPrioritySchema.optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one task field must be supplied.",
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export const taskVersionSchema = z.object({
  version: z.number().int().positive(),
});
export const taskIdParamSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});

// --- Project people (producers and creatives) ---

export const personKindSchema = z.enum(["producer", "creative"]);
export type PersonKind = z.infer<typeof personKindSchema>;
export const creativeRoleTypeSchema = z.enum([
  "director",
  "cast",
  "head_of_department",
]);
export type CreativeRoleType = z.infer<typeof creativeRoleTypeSchema>;
export const engagementStatusSchema = z.enum([
  "identified",
  "contacted",
  "interested",
  "offered",
  "confirmed",
  "contracted",
  "attached",
  "unavailable_passed",
]);
export type EngagementStatus = z.infer<typeof engagementStatusSchema>;
export const contractStatusSchema = z.enum([
  "not_sent",
  "sent",
  "signed",
  "pending_amendments",
]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

const contactTypeSchema = z.string().trim().min(1).max(40);
/** A contact whose type names an email address must hold a valid one. */
export const personContactSchema = z
  .object({
    type: contactTypeSchema,
    value: z.string().trim().min(1).max(200),
  })
  .superRefine((contact, context) => {
    if (
      /mail/i.test(contact.type) &&
      !z.string().email().safeParse(contact.value).success
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Enter a valid email address.",
      });
    }
  });
export type PersonContact = z.infer<typeof personContactSchema>;

export const personLinkSchema = z.object({
  label: z.string().trim().min(1).max(60),
  url: z
    .string()
    .trim()
    .url()
    .max(2_000)
    .refine((url) => /^https?:\/\//i.test(url), {
      message: "Links must start with http:// or https://.",
    }),
});
export type PersonLink = z.infer<typeof personLinkSchema>;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

/** Project-specific hiring information; the status itself moves by command. */
export const personEngagementSchema = z.object({
  status: engagementStatusSchema.nullable(),
  roleOnProject: z.string().nullable(),
  startDate: isoDateSchema.nullable(),
  contractStatus: contractStatusSchema.nullable(),
  notes: z.string().nullable(),
});
export type PersonEngagement = z.infer<typeof personEngagementSchema>;

/**
 * A person engaged with one project: a producer or a creative. The represented
 * person is not a Vault user; `createdBy` is the user who recorded them.
 */
export const personSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: personKindSchema,
  name: z.string(),
  /** Producer "role" or creative "specific role" (e.g. "Director of Photography"). */
  roleTitle: z.string(),
  /** Producers only. */
  company: z.string().nullable(),
  /** Creatives only. */
  creativeRoleType: creativeRoleTypeSchema.nullable(),
  /** Creatives only: representation. */
  agent: z.string().nullable(),
  contacts: z.array(personContactSchema),
  links: z.array(personLinkSchema),
  notes: z.string().nullable(),
  engagement: personEngagementSchema,
  /** Current versions of every attached document lineage. */
  documents: z.array(documentSchema),
  createdBy: userRefSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Person = z.infer<typeof personSchema>;

const personEngagementInputSchema = z.object({
  roleOnProject: z.string().trim().max(120).nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  contractStatus: contractStatusSchema.nullable().optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
});

const personCommonInputSchema = {
  name: z.string().trim().min(1).max(200),
  roleTitle: z.string().trim().min(1).max(120),
  contacts: z.array(personContactSchema).max(20).default([]),
  links: z.array(personLinkSchema).max(20).default([]),
  notes: z.string().trim().max(4_000).nullable().optional(),
  engagement: personEngagementInputSchema.default({}),
  /** The initial engagement status; later changes go through the status command. */
  status: engagementStatusSchema.nullable().default(null),
};

export const createPersonSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("producer"),
    company: z.string().trim().min(1).max(200),
    ...personCommonInputSchema,
  }),
  z.object({
    kind: z.literal("creative"),
    creativeRoleType: creativeRoleTypeSchema,
    agent: z.string().trim().max(200).nullable().optional(),
    ...personCommonInputSchema,
  }),
]);
export type CreatePersonInput = z.infer<typeof createPersonSchema>;

/** Kind is immutable; kind-specific fields are checked against it by the service. */
export const updatePersonSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    roleTitle: z.string().trim().min(1).max(120).optional(),
    company: z.string().trim().min(1).max(200).optional(),
    creativeRoleType: creativeRoleTypeSchema.optional(),
    agent: z.string().trim().max(200).nullable().optional(),
    contacts: z.array(personContactSchema).max(20).optional(),
    links: z.array(personLinkSchema).max(20).optional(),
    notes: z.string().trim().max(4_000).nullable().optional(),
    engagement: personEngagementInputSchema.optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one person field must be supplied.",
  });
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;

export const changePersonStatusSchema = z.object({
  status: engagementStatusSchema.nullable(),
  version: z.number().int().positive(),
});
export type ChangePersonStatusInput = z.infer<typeof changePersonStatusSchema>;
export const personVersionSchema = z.object({
  version: z.number().int().positive(),
});
export const personIdParamSchema = z.object({
  projectId: z.string().uuid(),
  personId: z.string().uuid(),
});
export const personDocumentParamSchema = personIdParamSchema.extend({
  documentId: z.string().uuid(),
});
export const personListQuerySchema = z.object({
  kind: personKindSchema.optional(),
});

/** Upload-and-attach: the document is created in the person's folder and linked in one transaction. */
export const attachNewPersonDocumentSchema = z.object({
  fileObjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  status: documentStatusSchema.default("draft"),
  notes: z.string().trim().max(4_000).optional(),
});
export type AttachNewPersonDocumentInput = z.infer<
  typeof attachNewPersonDocumentSchema
>;

// --- Underlying rights ---

export const rightsTypeSchema = z.enum([
  "original",
  "book",
  "article",
  "life_rights",
  "remake",
  "other",
]);
export type RightsType = z.infer<typeof rightsTypeSchema>;
export const rightsStatusSchema = z.enum(rightsStatusValues);

/** One underlying-rights source for a project (a book, a life story, a remake…). */
export const rightSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  rightsType: rightsTypeSchema,
  status: rightsStatusSchema,
  rightsHolder: z.string().nullable(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  notes: z.string().nullable(),
  documents: z.array(documentSchema),
  createdBy: userRefSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Right = z.infer<typeof rightSchema>;

const rightsDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const createRightSchema = z.object({
  rightsType: rightsTypeSchema,
  /** Must belong to the project's current stage; omitted means that stage's first status. */
  status: rightsStatusSchema.optional(),
  rightsHolder: z.string().trim().max(200).nullable().optional(),
  expiryDate: rightsDateSchema.nullable().optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
});
export type CreateRightInput = z.infer<typeof createRightSchema>;

export const updateRightSchema = z
  .object({
    rightsType: rightsTypeSchema.optional(),
    rightsHolder: z.string().trim().max(200).nullable().optional(),
    expiryDate: rightsDateSchema.nullable().optional(),
    notes: z.string().trim().max(4_000).nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one rights field must be supplied.",
  });
export type UpdateRightInput = z.infer<typeof updateRightSchema>;

export const changeRightStatusSchema = z.object({
  status: rightsStatusSchema,
  version: z.number().int().positive(),
});
export type ChangeRightStatusInput = z.infer<typeof changeRightStatusSchema>;
export const rightIdParamSchema = z.object({
  projectId: z.string().uuid(),
  rightId: z.string().uuid(),
});
export const rightDocumentParamSchema = rightIdParamSchema.extend({
  documentId: z.string().uuid(),
});

// --- Owner document attachment (shared by People, Rights and Legal) ---

/** Upload-and-attach input for any owner: the owner's service chooses the folder. */
export const attachNewOwnerDocumentSchema = z.object({
  fileObjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  status: documentStatusSchema.default("draft"),
  notes: z.string().trim().max(4_000).optional(),
});
export type AttachNewOwnerDocumentInput = z.infer<
  typeof attachNewOwnerDocumentSchema
>;
export const versionOnlySchema = z.object({
  version: z.number().int().positive(),
});

// --- Legal records (documentation) ---

export const legalCategorySchema = z.enum([
  "chain_of_title",
  "writer_agreements",
  "investment_agreements",
  "co_production",
  "producers_agreements",
  "director_agreements",
  "cast_agreements",
  "banking_docs",
  "funding_tax_credit",
  "sales_agency",
  "cama",
]);
export type LegalCategory = z.infer<typeof legalCategorySchema>;

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
const optionalEmail = z.string().trim().email().max(200).nullable().optional();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .nullable()
  .optional();
/** Money inside legal details is a decimal string; Finance will own real ledgers later. */
const decimalAmount = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    "Enter an amount such as 25000 or 25000.50.",
  );
export const legalCurrencySchema = z.enum(["GBP", "USD", "EUR"]);

/**
 * Per-category details, one schema each. `name` and `notes` are typed
 * columns on the record; everything here is category-specific and stored as
 * validated JSON. Enum-like selects keep the product's labels as values.
 */
export const legalDetailsSchema = z.discriminatedUnion("category", [
  z.object({
    category: z.literal("chain_of_title"),
    holder: z.string().trim().min(1).max(200),
    rightsType: z.enum([
      "Original Screenplay",
      "Underlying Work (Book/Article)",
      "Rewrite",
      "Assignment",
      "Option",
      "Other",
    ]),
    agreementDate: optionalDate,
  }),
  z.object({
    category: z.literal("writer_agreements"),
    role: z.enum([
      "Original Writer",
      "Co-writer",
      "Rewrite",
      "Polish",
      "Story By",
      "Other",
    ]),
    company: optionalText(200),
    email: optionalEmail,
  }),
  z.object({
    category: z.literal("investment_agreements"),
    investorType: z.enum(["Individual", "Company", "Fund", "Other"]),
    currency: legalCurrencySchema,
    amount: decimalAmount,
    commitment: z.enum(["Targeted", "Soft committed", "Closed"]),
    email: optionalEmail,
  }),
  z.object({
    category: z.literal("co_production"),
    country: optionalText(100),
    contactName: optionalText(200),
    email: optionalEmail,
  }),
  z.object({
    category: z.literal("producers_agreements"),
    role: z.enum([
      "Producer",
      "Executive Producer",
      "Line Producer",
      "Co-Producer",
      "Associate Producer",
      "Other",
    ]),
    company: optionalText(200),
    email: optionalEmail,
  }),
  z.object({
    category: z.literal("director_agreements"),
    company: optionalText(200),
    email: optionalEmail,
  }),
  z.object({
    category: z.literal("cast_agreements"),
    role: z.string().trim().min(1).max(200),
    castType: z.enum(["Lead", "Supporting", "Day Player", "Extra", "Other"]),
    fee: decimalAmount.nullable().optional(),
    agent: optionalText(200),
  }),
  z.object({
    category: z.literal("banking_docs"),
    purpose: z.enum([
      "Production Account",
      "Escrow",
      "Completion Bond",
      "Loan Facility",
      "Other",
    ]),
    contactName: optionalText(200),
    email: optionalEmail,
  }),
  z.object({
    category: z.literal("funding_tax_credit"),
    fundingType: z.enum([
      "Tax Credit",
      "Grant",
      "Public Fund",
      "Rebate / Incentive",
      "Other",
    ]),
    expectedAmount: decimalAmount.nullable().optional(),
    region: optionalText(100),
  }),
  z.object({
    category: z.literal("sales_agency"),
    territory: optionalText(200),
    contactName: optionalText(200),
    email: optionalEmail,
  }),
  z.object({
    category: z.literal("cama"),
    contactName: optionalText(200),
    email: optionalEmail,
  }),
]);
export type LegalDetails = z.infer<typeof legalDetailsSchema>;

/** A legal entity of one category with its attached documents. Confirmation is derived, never stored. */
export const legalRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  category: legalCategorySchema,
  name: z.string(),
  notes: z.string().nullable(),
  details: legalDetailsSchema,
  documents: z.array(documentSchema),
  createdBy: userRefSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LegalRecord = z.infer<typeof legalRecordSchema>;

export const createLegalRecordSchema = z.object({
  name: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4_000).nullable().optional(),
  details: legalDetailsSchema,
});
export type CreateLegalRecordInput = z.infer<typeof createLegalRecordSchema>;

/** Category is immutable; `details` replaces the whole detail set for the record's category. */
export const updateLegalRecordSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().max(4_000).nullable().optional(),
    details: legalDetailsSchema.optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one legal record field must be supplied.",
  });
export type UpdateLegalRecordInput = z.infer<typeof updateLegalRecordSchema>;

export const legalRecordIdParamSchema = z.object({
  projectId: z.string().uuid(),
  recordId: z.string().uuid(),
});
export const legalRecordDocumentParamSchema = legalRecordIdParamSchema.extend({
  documentId: z.string().uuid(),
});
export const legalRecordListQuerySchema = z.object({
  category: legalCategorySchema.optional(),
});

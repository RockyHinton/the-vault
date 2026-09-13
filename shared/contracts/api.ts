import { z } from "zod";
import { rightsStatusValues } from "./rights-status";
import { isoDateSchema } from "./dates";
import { currencyCodeSchema, moneySchema, moneyValueSchema } from "./money";
import {
  financeSourceStatusValues,
  financingSummarySchema,
} from "./finance-plan";
import {
  cashFlowDirectionValues,
  cashFlowProjectionSchema,
  cashFlowTimeframeValues,
  signedMoneyValueSchema,
} from "./cash-flow";

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

/** Safe human identity for authorship and assignment. Never carries email or role. */
export const userRefSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
});
export type UserRef = z.infer<typeof userRefSchema>;

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
  /** The uploader of this version; the actor who may edit, version or delete it (or an admin). */
  createdBy: userRefSchema,
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
  expiryDate: isoDateSchema.nullable(),
  notes: z.string().nullable(),
  documents: z.array(documentSchema),
  createdBy: userRefSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Right = z.infer<typeof rightSchema>;

const rightsDateSchema = isoDateSchema;

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
const optionalDate = isoDateSchema.nullable().optional();
/** Money inside legal details is a decimal string; Finance will own real ledgers later. */
const decimalAmount = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    "Enter an amount such as 25000 or 25000.50.",
  );
/** Legal details reuse the shared currency vocabulary. */
export const legalCurrencySchema = currencyCodeSchema;

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

// --- Scripts ---

/**
 * A screenplay is a project business concept over one Document lineage. The
 * Documents domain owns every version (id, number, bytes, checksum, uploader);
 * the Script owns project meaning and exact-version annotations. There is no
 * script-side version counter and no mutable script field today.
 */
export const scriptSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  /** The first version's document id; stable for the life of the script. */
  documentLineageId: z.string().uuid(),
  title: z.string(),
  /** The lineage's live current version: exact provenance for readers and future analysis. */
  currentVersion: documentSchema,
  versionCount: z.number().int().positive(),
  createdBy: userRefSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Script = z.infer<typeof scriptSchema>;

/** Script plus every live version of its lineage, oldest first. */
export const scriptDetailSchema = z.object({
  script: scriptSchema,
  versions: z.array(documentSchema),
});
export type ScriptDetail = z.infer<typeof scriptDetailSchema>;

export const createScriptSchema = z.object({
  fileObjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4_000).optional(),
});
export type CreateScriptInput = z.infer<typeof createScriptSchema>;

export const addScriptVersionSchema = z.object({
  fileObjectId: z.string().uuid(),
  notes: z.string().trim().max(4_000).optional(),
  /** The current version document's own `version`, so two uploads cannot race. */
  currentDocumentVersion: z.number().int().positive(),
});
export type AddScriptVersionInput = z.infer<typeof addScriptVersionSchema>;

export const scriptIdParamSchema = z.object({
  projectId: z.string().uuid(),
  scriptId: z.string().uuid(),
});
export const scriptVersionParamSchema = scriptIdParamSchema.extend({
  documentId: z.string().uuid(),
});

// --- Script annotations (bound to an exact document version) ---

export const annotationTypeSchema = z.enum([
  "creative",
  "commercial",
  "question",
  "concern",
]);
export type AnnotationType = z.infer<typeof annotationTypeSchema>;
export const annotationTagSchema = z.enum([
  "dialogue",
  "structure",
  "character",
  "pacing",
  "budget_impact",
  "other",
]);
export type AnnotationTag = z.infer<typeof annotationTagSchema>;

/** Page-local position as percentages of the rendered page, as the reader captures it. */
const percentSchema = z.number().min(0).max(100);

export const scriptAnnotationSchema = z.object({
  id: z.string().uuid(),
  scriptId: z.string().uuid(),
  /** The exact document version this note was written against. Never the lineage. */
  documentId: z.string().uuid(),
  author: userRefSchema,
  pageNumber: z.number().int().positive(),
  x: percentSchema,
  y: percentSchema,
  type: annotationTypeSchema,
  tag: annotationTagSchema.nullable(),
  body: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ScriptAnnotation = z.infer<typeof scriptAnnotationSchema>;

export const createScriptAnnotationSchema = z.object({
  pageNumber: z.number().int().positive().max(10_000),
  x: percentSchema,
  y: percentSchema,
  type: annotationTypeSchema,
  tag: annotationTagSchema.nullable().default(null),
  body: z.string().trim().min(1).max(4_000),
});
export type CreateScriptAnnotationInput = z.infer<
  typeof createScriptAnnotationSchema
>;

export const updateScriptAnnotationSchema = z
  .object({
    type: annotationTypeSchema.optional(),
    tag: annotationTagSchema.nullable().optional(),
    body: z.string().trim().min(1).max(4_000).optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one annotation field must be supplied.",
  });
export type UpdateScriptAnnotationInput = z.infer<
  typeof updateScriptAnnotationSchema
>;

export const scriptAnnotationIdParamSchema = scriptIdParamSchema.extend({
  annotationId: z.string().uuid(),
});

// --- Finance: Budget ---

export const budgetVersionStatusSchema = z.enum([
  "draft",
  "awaiting_approval",
  "locked",
]);
export type BudgetVersionStatus = z.infer<typeof budgetVersionStatusSchema>;

/** The departments every new budget starts with; users may rename, add and remove them. */
export const defaultBudgetDepartments = [
  "Above the Line",
  "Production",
  "Post-Production",
  "Other",
  "Contingency",
] as const;

export const budgetLineItemSchema = z.object({
  id: z.string().uuid(),
  departmentId: z.string().uuid(),
  name: z.string(),
  /** Directly authored; there is no quantity × unit cost in the product. */
  amount: moneyValueSchema,
  note: z.string().nullable(),
  position: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BudgetLineItem = z.infer<typeof budgetLineItemSchema>;

export const budgetDepartmentSchema = z.object({
  id: z.string().uuid(),
  budgetVersionId: z.string().uuid(),
  name: z.string(),
  position: z.number().int().nonnegative(),
  /** Sum of this department's line items, computed by PostgreSQL. */
  total: moneyValueSchema,
  lineItems: z.array(budgetLineItemSchema),
  documents: z.array(documentSchema),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BudgetDepartment = z.infer<typeof budgetDepartmentSchema>;

/** A version's lifecycle facts: who did what and when. Locked versions never change again. */
export const budgetVersionSummarySchema = z.object({
  id: z.string().uuid(),
  budgetId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  status: budgetVersionStatusSchema,
  /** Sum of every line item in the version, computed by PostgreSQL. */
  total: moneyValueSchema,
  createdBy: userRefSchema,
  createdAt: z.string().datetime(),
  submittedBy: userRefSchema.nullable(),
  submittedAt: z.string().datetime().nullable(),
  lockedBy: userRefSchema.nullable(),
  lockedAt: z.string().datetime().nullable(),
  /** Optimistic concurrency for lifecycle commands. */
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});
export type BudgetVersionSummary = z.infer<typeof budgetVersionSummarySchema>;

export const budgetVersionSchema = budgetVersionSummarySchema.extend({
  currency: currencyCodeSchema,
  departments: z.array(budgetDepartmentSchema),
});
export type BudgetVersion = z.infer<typeof budgetVersionSchema>;

/**
 * The project's budget. `currentVersion` is the open (draft or awaiting)
 * version if one exists, otherwise the latest locked version; `versions`
 * lists every version newest first so any exact version can be addressed.
 */
export const budgetSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  currency: currencyCodeSchema,
  createdBy: userRefSchema,
  createdAt: z.string().datetime(),
  currentVersion: budgetVersionSchema,
  /** The version later Finance Plan and Cash Flow work should reference, when one exists. */
  latestLockedVersionId: z.string().uuid().nullable(),
  versions: z.array(budgetVersionSummarySchema),
});
export type Budget = z.infer<typeof budgetSchema>;

export const createBudgetSchema = z.object({
  currency: currencyCodeSchema.default("USD"),
});
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;

export const createBudgetDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateBudgetDepartmentInput = z.infer<
  typeof createBudgetDepartmentSchema
>;
export const updateBudgetDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  version: z.number().int().positive(),
});
export type UpdateBudgetDepartmentInput = z.infer<
  typeof updateBudgetDepartmentSchema
>;

export const createBudgetLineItemSchema = z.object({
  name: z.string().trim().min(1).max(200).default("New Item"),
  amount: moneySchema.default("0.00"),
  note: z.string().trim().max(1_000).nullable().optional(),
});
export type CreateBudgetLineItemInput = z.infer<
  typeof createBudgetLineItemSchema
>;
export const updateBudgetLineItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    amount: moneySchema.optional(),
    note: z.string().trim().max(1_000).nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one line item field must be supplied.",
  });
export type UpdateBudgetLineItemInput = z.infer<
  typeof updateBudgetLineItemSchema
>;

export const budgetVersionParamSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
});
export const budgetDepartmentParamSchema = z.object({
  projectId: z.string().uuid(),
  departmentId: z.string().uuid(),
});
export const budgetDepartmentDocumentParamSchema =
  budgetDepartmentParamSchema.extend({
    documentId: z.string().uuid(),
  });
export const budgetLineItemParamSchema = z.object({
  projectId: z.string().uuid(),
  lineItemId: z.string().uuid(),
});

// --- Finance: Finance Plan ---

export const financeSourceTypeSchema = z.enum([
  "equity",
  "pre_sale",
  "distributor_mg",
  "grant",
  "tax_credit",
  "loan",
  "gap_finance",
  "other",
]);
export type FinanceSourceType = z.infer<typeof financeSourceTypeSchema>;
export const financeSourceStatusSchema = z.enum(financeSourceStatusValues);

const isoDate = isoDateSchema;

/**
 * One source of financing. An approved source is a permanent financial fact:
 * its fields never change again and it cannot be removed, so later cash-flow
 * work may reference it by id.
 */
export const financeSourceSchema = z.object({
  id: z.string().uuid(),
  financePlanId: z.string().uuid(),
  name: z.string(),
  type: financeSourceTypeSchema,
  amount: moneyValueSchema,
  status: financeSourceStatusSchema,
  expectedDate: isoDate.nullable(),
  notes: z.string().nullable(),
  position: z.number().int().nonnegative(),
  documents: z.array(documentSchema),
  createdBy: userRefSchema,
  approvedBy: userRefSchema.nullable(),
  approvedAt: z.string().datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FinanceSource = z.infer<typeof financeSourceSchema>;

/**
 * The project's finance plan: a living register of sources that finances one
 * exact, locked budget version. Currency and budget total come from that
 * version; totals and the gap are the shared `summarizeFinancing` result.
 */
export const financePlanSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  budgetVersionId: z.string().uuid(),
  budgetVersionNumber: z.number().int().positive(),
  currency: currencyCodeSchema,
  summary: financingSummarySchema,
  sources: z.array(financeSourceSchema),
  createdBy: userRefSchema,
  /** Optimistic concurrency for plan-level commands (rebasing to another budget version). */
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FinancePlan = z.infer<typeof financePlanSchema>;

export const createFinancePlanSchema = z.object({
  /** Must be a locked version of this project's budget. */
  budgetVersionId: z.string().uuid(),
});
export type CreateFinancePlanInput = z.infer<typeof createFinancePlanSchema>;
export const rebaseFinancePlanSchema = z.object({
  budgetVersionId: z.string().uuid(),
  version: z.number().int().positive(),
});
export type RebaseFinancePlanInput = z.infer<typeof rebaseFinancePlanSchema>;

export const createFinanceSourceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: financeSourceTypeSchema,
  amount: moneySchema,
  /** Approval is a separate command; a source is created targeted or soft committed. */
  status: z.enum(["targeted", "soft_committed"]).default("targeted"),
  expectedDate: isoDate.nullable().optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
});
export type CreateFinanceSourceInput = z.infer<
  typeof createFinanceSourceSchema
>;
export const updateFinanceSourceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    type: financeSourceTypeSchema.optional(),
    amount: moneySchema.optional(),
    expectedDate: isoDate.nullable().optional(),
    notes: z.string().trim().max(4_000).nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one source field must be supplied.",
  });
export type UpdateFinanceSourceInput = z.infer<
  typeof updateFinanceSourceSchema
>;
export const changeFinanceSourceStatusSchema = z.object({
  status: z.enum(["targeted", "soft_committed"]),
  version: z.number().int().positive(),
});
export type ChangeFinanceSourceStatusInput = z.infer<
  typeof changeFinanceSourceStatusSchema
>;
export const financeSourceParamSchema = z.object({
  projectId: z.string().uuid(),
  sourceId: z.string().uuid(),
});
export const financeSourceDocumentParamSchema = financeSourceParamSchema.extend(
  {
    documentId: z.string().uuid(),
  },
);

// --- Finance: Cash Flow ---

export const cashFlowTimeframeSchema = z.enum(cashFlowTimeframeValues);
export const cashFlowDirectionSchema = z.enum(cashFlowDirectionValues);

/** A dated payment or receipt authored against a department, outside the window spread. */
export const cashFlowPaymentSchema = z.object({
  id: z.string().uuid(),
  cashFlowId: z.string().uuid(),
  departmentId: z.string().uuid(),
  name: z.string(),
  amount: moneyValueSchema,
  direction: cashFlowDirectionSchema,
  date: isoDate,
  note: z.string().nullable(),
  createdBy: userRefSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CashFlowPayment = z.infer<typeof cashFlowPaymentSchema>;

export const cashFlowDepartmentWindowSchema = z.object({
  startDate: isoDate,
  endDate: isoDate,
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});
export type CashFlowDepartmentWindow = z.infer<
  typeof cashFlowDepartmentWindowSchema
>;

/** A department of the referenced locked budget version with its scheduling state. */
export const cashFlowDepartmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  position: z.number().int().nonnegative(),
  /** Exact department total in the locked version, never authored here. */
  total: moneyValueSchema,
  window: cashFlowDepartmentWindowSchema.nullable(),
  payments: z.array(cashFlowPaymentSchema),
});
export type CashFlowDepartment = z.infer<typeof cashFlowDepartmentSchema>;

/** An approved financing source as a scheduled inflow. */
export const cashFlowSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: financeSourceTypeSchema,
  amount: moneyValueSchema,
  /** The Finance Plan's expected date. */
  expectedDate: isoDate.nullable(),
  /** A cash-flow-only override; the source itself is never changed. */
  timing: z
    .object({
      expectedDate: isoDate,
      version: z.number().int().positive(),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
  /** The date the projection uses: the override when set, else the plan's date. */
  scheduledDate: isoDate.nullable(),
});
export type CashFlowSource = z.infer<typeof cashFlowSourceSchema>;

export const cashFlowSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  financePlanId: z.string().uuid(),
  /** Resolved through the finance plan: the exact locked version outflows derive from. */
  budgetVersionId: z.string().uuid(),
  budgetVersionNumber: z.number().int().positive(),
  currency: currencyCodeSchema,
  timeframe: cashFlowTimeframeSchema,
  openingBalance: moneyValueSchema,
  departments: z.array(cashFlowDepartmentSchema),
  sources: z.array(cashFlowSourceSchema),
  projection: cashFlowProjectionSchema,
  createdBy: userRefSchema,
  /** Optimistic concurrency for the cash flow's own fields (opening balance, timeframe). */
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CashFlow = z.infer<typeof cashFlowSchema>;

export const updateCashFlowSchema = z
  .object({
    openingBalance: moneySchema.optional(),
    timeframe: cashFlowTimeframeSchema.optional(),
    version: z.number().int().positive(),
  })
  .refine(
    (value) =>
      value.openingBalance !== undefined || value.timeframe !== undefined,
    { message: "Nothing to change." },
  );
export type UpdateCashFlowInput = z.infer<typeof updateCashFlowSchema>;

/** `version: 0` creates the window; the current version replaces it. */
export const setCashFlowDepartmentWindowSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    version: z.number().int().nonnegative(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "The window must end on or after it starts.",
    path: ["endDate"],
  });
export type SetCashFlowDepartmentWindowInput = z.infer<
  typeof setCashFlowDepartmentWindowSchema
>;

const positiveMoneySchema = moneySchema.refine((value) => value !== "0.00", {
  message: "Enter an amount greater than zero.",
});

export const createCashFlowPaymentSchema = z.object({
  departmentId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  amount: positiveMoneySchema,
  direction: cashFlowDirectionSchema,
  date: isoDate,
  note: z.string().trim().max(2_000).optional(),
});
export type CreateCashFlowPaymentInput = z.infer<
  typeof createCashFlowPaymentSchema
>;

export const updateCashFlowPaymentSchema = z
  .object({
    departmentId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(180).optional(),
    amount: positiveMoneySchema.optional(),
    direction: cashFlowDirectionSchema.optional(),
    date: isoDate.optional(),
    note: z.string().trim().max(2_000).nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine(
    (value) =>
      Object.entries(value).some(
        ([key, v]) => key !== "version" && v !== undefined,
      ),
    { message: "Nothing to change." },
  );
export type UpdateCashFlowPaymentInput = z.infer<
  typeof updateCashFlowPaymentSchema
>;

/** `version: 0` creates the override; the current version replaces it. */
export const setCashFlowSourceTimingSchema = z.object({
  expectedDate: isoDate,
  version: z.number().int().nonnegative(),
});
export type SetCashFlowSourceTimingInput = z.infer<
  typeof setCashFlowSourceTimingSchema
>;

export const cashFlowDepartmentParamSchema = z.object({
  projectId: z.string().uuid(),
  departmentId: z.string().uuid(),
});
export const cashFlowPaymentParamSchema = z.object({
  projectId: z.string().uuid(),
  paymentId: z.string().uuid(),
});

// --- Finance: Financing Overview (read-only, derived) ---

/**
 * Everything the overview shows is computed from Budget, Finance Plan and
 * Cash Flow at read time. Nothing here is stored.
 */
export const financingOverviewSchema = z.object({
  currency: currencyCodeSchema.nullable(),
  budget: z
    .object({
      id: z.string().uuid(),
      /** The latest locked version, or null while nothing has been locked. */
      lockedVersion: z
        .object({
          id: z.string().uuid(),
          versionNumber: z.number().int().positive(),
          total: moneyValueSchema,
          lockedBy: userRefSchema.nullable(),
          lockedAt: z.string().datetime().nullable(),
        })
        .nullable(),
      /** Status of the open (unlocked) version, if any. */
      openVersionStatus: budgetVersionStatusSchema.nullable(),
    })
    .nullable(),
  financePlan: z
    .object({
      id: z.string().uuid(),
      budgetVersionId: z.string().uuid(),
      budgetVersionNumber: z.number().int().positive(),
      summary: financingSummarySchema,
      sources: z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          type: financeSourceTypeSchema,
          status: financeSourceStatusSchema,
          amount: moneyValueSchema,
        }),
      ),
    })
    .nullable(),
  cashFlow: z
    .object({
      id: z.string().uuid(),
      timeframe: cashFlowTimeframeSchema,
      openingBalance: moneyValueSchema,
      totalInflow: signedMoneyValueSchema,
      totalOutflow: signedMoneyValueSchema,
      closingBalance: signedMoneyValueSchema,
      lowestBalance: signedMoneyValueSchema,
      lowestBalancePeriodLabel: z.string().nullable(),
      firstShortfallPeriodLabel: z.string().nullable(),
      periodCount: z.number().int().nonnegative(),
      unscheduledInflow: signedMoneyValueSchema,
      unscheduledOutflow: signedMoneyValueSchema,
    })
    .nullable(),
});
export type FinancingOverview = z.infer<typeof financingOverviewSchema>;

// --- Distribution ---

/** The commercial state of a territory. No transition rules: the team records what is true. */
export const distributionTerritoryStatusSchema = z.enum([
  "available",
  "in_discussion",
  "licensed",
  "delivered",
  "closed",
]);
export type DistributionTerritoryStatus = z.infer<
  typeof distributionTerritoryStatusSchema
>;

const territoryNameSchema = z.string().trim().min(1).max(120);
const dealTextSchema = z.string().trim().max(500);
const dealNotesSchema = z.string().trim().max(4_000);

/**
 * Deal information is descriptive text the team keeps per territory ("20% on
 * signature"); the product records it, it never calculates with it, so
 * nothing here is money.
 */
export const distributionDealSchema = z.object({
  distributor: z.string().nullable(),
  contact: z.string().nullable(),
  signaturePayment: z.string().nullable(),
  deliveryPayment: z.string().nullable(),
  generalNotes: z.string().nullable(),
});
export type DistributionDeal = z.infer<typeof distributionDealSchema>;

/** A note written against one territory: an authored record (author-or-admin). */
export const distributionTerritoryNoteSchema = z.object({
  id: z.string().uuid(),
  territoryId: z.string().uuid(),
  author: userRefSchema,
  body: z.string(),
  /** Set once the body has been edited after creation. */
  editedAt: z.string().datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DistributionTerritoryNote = z.infer<
  typeof distributionTerritoryNoteSchema
>;

/** The grid card: a territory with counts, without its notes and documents. */
export const distributionTerritorySummarySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  status: distributionTerritoryStatusSchema,
  noteCount: z.number().int().nonnegative(),
  documentCount: z.number().int().nonnegative(),
  createdBy: userRefSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DistributionTerritorySummary = z.infer<
  typeof distributionTerritorySummarySchema
>;

export const distributionTerritorySchema =
  distributionTerritorySummarySchema.extend({
    deal: distributionDealSchema,
    notes: z.array(distributionTerritoryNoteSchema),
    /** Current versions of every attached document lineage. */
    documents: z.array(documentSchema),
  });
export type DistributionTerritory = z.infer<typeof distributionTerritorySchema>;

export const distributionTerritoryListSchema = z.object({
  items: z.array(distributionTerritorySummarySchema),
});

export const createDistributionTerritorySchema = z.object({
  name: territoryNameSchema,
});
export type CreateDistributionTerritoryInput = z.infer<
  typeof createDistributionTerritorySchema
>;

/** Rename and deal edits are collaborative; status moves through its own command. */
export const updateDistributionTerritorySchema = z
  .object({
    name: territoryNameSchema.optional(),
    distributor: dealTextSchema.optional(),
    contact: dealTextSchema.optional(),
    signaturePayment: dealTextSchema.optional(),
    deliveryPayment: dealTextSchema.optional(),
    generalNotes: dealNotesSchema.optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Nothing to change.",
  });
export type UpdateDistributionTerritoryInput = z.infer<
  typeof updateDistributionTerritorySchema
>;

export const changeDistributionTerritoryStatusSchema = z.object({
  status: distributionTerritoryStatusSchema,
  version: z.number().int().positive(),
});
export type ChangeDistributionTerritoryStatusInput = z.infer<
  typeof changeDistributionTerritoryStatusSchema
>;

export const createDistributionTerritoryNoteSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
});
export type CreateDistributionTerritoryNoteInput = z.infer<
  typeof createDistributionTerritoryNoteSchema
>;
export const updateDistributionTerritoryNoteSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
  version: z.number().int().positive(),
});
export type UpdateDistributionTerritoryNoteInput = z.infer<
  typeof updateDistributionTerritoryNoteSchema
>;

export const distributionTerritoryParamSchema = z.object({
  projectId: z.string().uuid(),
  territoryId: z.string().uuid(),
});
export const distributionTerritoryNoteParamSchema =
  distributionTerritoryParamSchema.extend({
    noteId: z.string().uuid(),
  });
export const distributionTerritoryDocumentParamSchema =
  distributionTerritoryParamSchema.extend({
    documentId: z.string().uuid(),
  });

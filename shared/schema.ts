import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const applicationRole = pgEnum("application_role", [
  "studio_admin",
  "user",
]);
export const userStatus = pgEnum("user_status", ["active", "suspended"]);
export const projectStage = pgEnum("project_stage", [
  "evaluation",
  "development",
  "production",
]);
export const archiveReason = pgEnum("archive_reason", [
  "creative_pass",
  "commercial_viability",
  "financing_not_secured",
  "rights_legal_issues",
  "packaging_fell_through",
  "paused_strategic_timing",
  "produced_completed",
  "withdrawn",
]);
export const revisitDisposition = pgEnum("revisit_disposition", [
  "yes",
  "maybe",
  "no",
]);
/** staged: bytes stored, not yet claimed by a document. available: referenced. deleted: swept/retired. */
export const fileObjectStatus = pgEnum("file_object_status", [
  "staged",
  "available",
  "deleted",
]);
export const documentStatus = pgEnum("document_status", [
  "draft",
  "under_review",
  "final",
  "signed",
]);
export const financeType = pgEnum("finance_type", [
  "grant",
  "subsidy",
  "equity",
  "loan",
  "pre_sale",
  "deferral",
]);
export const reviewRecommendation = pgEnum("review_recommendation", [
  "pass",
  "consider",
  "develop",
]);
export const noteCategory = pgEnum("note_category", [
  "script",
  "financing",
  "cast",
  "other",
]);
export const taskCategory = pgEnum("task_category", [
  "finance",
  "talent",
  "legal",
  "production",
  "general",
]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high"]);
export const taskStatus = pgEnum("task_status", ["open", "done"]);
export const personKind = pgEnum("person_kind", ["producer", "creative"]);
export const creativeRoleType = pgEnum("creative_role_type", [
  "director",
  "cast",
  "head_of_department",
]);
export const engagementStatus = pgEnum("engagement_status", [
  "identified",
  "contacted",
  "interested",
  "offered",
  "confirmed",
  "contracted",
  "attached",
  "unavailable_passed",
]);
export const rightsType = pgEnum("rights_type", [
  "original",
  "book",
  "article",
  "life_rights",
  "remake",
  "other",
]);
export const rightsStatus = pgEnum("rights_status", [
  "identified",
  "contacted",
  "under_review",
  "option_pending",
  "optioned",
  "not_available",
  "extended",
  "purchase_pending",
  "purchased",
  "rights_issue",
  "cleared",
  "chain_complete",
  "missing_doc",
  "expired",
  "legal_hold",
]);
export const legalCategory = pgEnum("legal_category", [
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
export const contractStatus = pgEnum("contract_status", [
  "not_sent",
  "sent",
  "signed",
  "pending_amendments",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const applicationUsers = pgTable(
  "application_users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Login identifier; unique case-insensitively. */
    email: text("email").notNull(),
    displayName: text("display_name"),
    role: applicationRole("role").notNull().default("user"),
    status: userStatus("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("application_users_email_lower_unique").on(
      sql`lower(${table.email})`,
    ),
    index("application_users_status_idx").on(table.status),
    check("application_users_version_positive", sql`${table.version} > 0`),
  ],
);

/**
 * Password credential, kept apart from identity/access. `password_hash` is a
 * self-describing string (algorithm and parameters included), so hashing can
 * be upgraded per credential without a schema change.
 */
export const userCredentials = pgTable("user_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => applicationUsers.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ...timestamps,
});

/**
 * Server-side sessions. The browser holds an opaque random token; only its
 * SHA-256 is stored, so the table never reveals a usable credential.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    logline: text("logline"),
    synopsis: text("synopsis"),
    genre: text("genre"),
    stage: projectStage("stage").notNull().default("evaluation"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archiveReason: archiveReason("archive_reason"),
    archiveRevisit: revisitDisposition("archive_revisit"),
    archiveStarred: boolean("archive_starred"),
    archiveNotes: text("archive_notes"),
    archivedFromStage: projectStage("archived_from_stage"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("projects_active_updated_at_idx").on(
      table.deletedAt,
      table.archivedAt,
      table.updatedAt,
    ),
    index("projects_created_by_user_id_idx").on(table.createdByUserId),
    check("projects_version_positive", sql`${table.version} > 0`),
    check(
      "projects_archive_fields_coherent",
      sql`(
        (${table.archivedAt} IS NULL AND ${table.archiveReason} IS NULL AND ${table.archiveRevisit} IS NULL AND ${table.archiveStarred} IS NULL AND ${table.archiveNotes} IS NULL AND ${table.archivedFromStage} IS NULL)
        OR
        (${table.archivedAt} IS NOT NULL AND ${table.archiveReason} IS NOT NULL AND ${table.archiveRevisit} IS NOT NULL AND ${table.archiveStarred} IS NOT NULL AND ${table.archivedFromStage} IS NOT NULL)
      )`,
    ),
  ],
);

export const projectStageHistory = pgTable(
  "project_stage_history",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    fromStage: projectStage("from_stage"),
    toStage: projectStage("to_stage").notNull(),
    transitionType: text("transition_type").notNull(),
    note: text("note"),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    requestId: uuid("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_stage_history_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    check(
      "project_stage_history_created_shape",
      sql`((${table.transitionType} = 'created' AND ${table.fromStage} IS NULL) OR (${table.transitionType} <> 'created' AND ${table.fromStage} IS NOT NULL))`,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    actorUserId: uuid("actor_user_id").references(() => applicationUsers.id, {
      onDelete: "restrict",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    requestId: uuid("request_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index("audit_events_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
  ],
);

/**
 * Immutable file bytes live in object storage under a random key; this row is
 * the only place the key is known. Bytes are never rewritten: a new upload is
 * a new row. Rows are inserted only after the bytes are fully stored.
 */
export const fileObjects = pgTable(
  "file_objects",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mediaType: text("media_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    status: fileObjectStatus("status").notNull().default("staged"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    availableAt: timestamp("available_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("file_objects_storage_key_unique").on(table.storageKey),
    index("file_objects_status_created_idx").on(table.status, table.createdAt),
    index("file_objects_created_by_user_id_idx").on(table.createdByUserId),
    check("file_objects_byte_size_positive", sql`${table.byteSize} > 0`),
    check("file_objects_sha256_shape", sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
  ],
);

/**
 * A document is a business record over one immutable file. Versions share a
 * lineage; exactly one live version per lineage is current. Folders mirror
 * the workspace sections and are validated by the contracts.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    lineageId: uuid("lineage_id")
      .notNull()
      .references((): AnyPgColumn => documents.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull().default(1),
    isCurrent: boolean("is_current").notNull().default(true),
    fileObjectId: uuid("file_object_id")
      .notNull()
      .references(() => fileObjects.id, { onDelete: "restrict" }),
    folder: text("folder").notNull(),
    title: text("title").notNull(),
    status: documentStatus("status").notNull().default("draft"),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("documents_file_object_id_unique").on(table.fileObjectId),
    uniqueIndex("documents_lineage_version_unique").on(
      table.lineageId,
      table.versionNumber,
    ),
    uniqueIndex("documents_lineage_current_unique")
      .on(table.lineageId)
      .where(sql`${table.isCurrent} = true AND ${table.deletedAt} IS NULL`),
    index("documents_project_folder_idx").on(table.projectId, table.folder),
    index("documents_lineage_idx").on(table.lineageId),
    check("documents_version_positive", sql`${table.version} > 0`),
    check("documents_version_number_positive", sql`${table.versionNumber} > 0`),
  ],
);

/** One evaluation profile per project, including the four development gates. */
export const projectEvaluations = pgTable(
  "project_evaluations",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "restrict" }),
    writer: text("writer"),
    director: text("director"),
    plannedBudget: text("planned_budget"),
    financeTypes: financeType("finance_types").array().notNull().default([]),
    scriptApproved: boolean("script_approved").notNull().default(false),
    budgetApproved: boolean("budget_approved").notNull().default(false),
    financeApproved: boolean("finance_approved").notNull().default(false),
    talentAttached: boolean("talent_attached").notNull().default(false),
    version: integer("version").notNull().default(1),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    check("project_evaluations_version_positive", sql`${table.version} > 0`),
  ],
);

const score = (name: string) => integer(name).notNull();

/** One review per project and author; PostgreSQL enforces the pair. */
export const projectReviews = pgTable(
  "project_reviews",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    scriptScore: score("script_score"),
    directorScore: score("director_score"),
    castScore: score("cast_score"),
    financingScore: score("financing_score"),
    recommendation: reviewRecommendation("recommendation").notNull(),
    summaryNotes: text("summary_notes").notNull(),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("project_reviews_project_author_unique").on(
      table.projectId,
      table.authorUserId,
    ),
    check("project_reviews_version_positive", sql`${table.version} > 0`),
    check(
      "project_reviews_scores_in_range",
      sql`${table.scriptScore} BETWEEN 0 AND 10 AND ${table.directorScore} BETWEEN 0 AND 10 AND ${table.castScore} BETWEEN 0 AND 10 AND ${table.financingScore} BETWEEN 0 AND 10`,
    ),
    check(
      "project_reviews_summary_not_blank",
      sql`length(btrim(${table.summaryNotes})) > 0`,
    ),
  ],
);

export const projectNotes = pgTable(
  "project_notes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    category: noteCategory("category").notNull(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("project_notes_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    check("project_notes_version_positive", sql`${table.version} > 0`),
    check(
      "project_notes_body_not_blank",
      sql`length(btrim(${table.body})) > 0`,
    ),
  ],
);

export const projectTasks = pgTable(
  "project_tasks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    category: taskCategory("category").notNull().default("general"),
    priority: taskPriority("priority").notNull().default("medium"),
    status: taskStatus("status").notNull().default("open"),
    assigneeUserId: uuid("assignee_user_id").references(
      () => applicationUsers.id,
      { onDelete: "restrict" },
    ),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("project_tasks_project_status_created_idx").on(
      table.projectId,
      table.status,
      table.createdAt,
    ),
    index("project_tasks_assignee_idx").on(table.assigneeUserId),
    check("project_tasks_version_positive", sql`${table.version} > 0`),
    check(
      "project_tasks_title_not_blank",
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      "project_tasks_completed_at_matches_status",
      sql`(${table.status} = 'done' AND ${table.completedAt} IS NOT NULL) OR (${table.status} = 'open' AND ${table.completedAt} IS NULL)`,
    ),
  ],
);

/** JSON value shapes stored on people; validated by the contracts before they get here. */
export interface PersonContactJson {
  type: string;
  value: string;
}
export interface PersonLinkJson {
  label: string;
  url: string;
}

/**
 * A producer or creative engaged with one project. The person is not a Vault
 * user; `created_by_user_id` is who recorded them. Kind-specific columns are
 * enforced by CHECK constraints rather than separate tables.
 */
export const projectPeople = pgTable(
  "project_people",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    kind: personKind("kind").notNull(),
    name: text("name").notNull(),
    roleTitle: text("role_title").notNull(),
    company: text("company"),
    creativeRoleType: creativeRoleType("creative_role_type"),
    agent: text("agent"),
    contacts: jsonb("contacts")
      .$type<PersonContactJson[]>()
      .notNull()
      .default([]),
    links: jsonb("links").$type<PersonLinkJson[]>().notNull().default([]),
    notes: text("notes"),
    engagementStatus: engagementStatus("engagement_status"),
    roleOnProject: text("role_on_project"),
    startDate: date("start_date"),
    contractStatus: contractStatus("contract_status"),
    engagementNotes: text("engagement_notes"),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("project_people_project_kind_created_idx").on(
      table.projectId,
      table.kind,
      table.createdAt,
    ),
    check("project_people_version_positive", sql`${table.version} > 0`),
    check(
      "project_people_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "project_people_role_title_not_blank",
      sql`length(btrim(${table.roleTitle})) > 0`,
    ),
    check(
      "project_people_producer_has_company",
      sql`${table.kind} <> 'producer' OR ${table.company} IS NOT NULL`,
    ),
    check(
      "project_people_creative_role_type_matches_kind",
      sql`(${table.kind} = 'creative') = (${table.creativeRoleType} IS NOT NULL)`,
    ),
    check(
      "project_people_contacts_is_array",
      sql`jsonb_typeof(${table.contacts}) = 'array'`,
    ),
    check(
      "project_people_links_is_array",
      sql`jsonb_typeof(${table.links}) = 'array'`,
    ),
  ],
);

/**
 * Documents attached to a person. The key is the document *lineage* (the first
 * version's id, itself a `documents.id`), so a new version stays attached and
 * reads resolve the current version. This is the canonical owner→documents
 * join for every domain (ADR 0008).
 */
export const projectPersonDocuments = pgTable(
  "project_person_documents",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => projectPeople.id, { onDelete: "restrict" }),
    documentLineageId: uuid("document_lineage_id")
      .notNull()
      .references(() => documents.id, { onDelete: "restrict" }),
    attachedByUserId: uuid("attached_by_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    attachedAt: timestamp("attached_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.personId, table.documentLineageId] }),
    index("project_person_documents_lineage_idx").on(table.documentLineageId),
  ],
);

/**
 * Columns every owner→documents join table shares. Owners reference the
 * document lineage (the first version's id) so new versions stay attached.
 */
const attachmentColumns = {
  documentLineageId: uuid("document_lineage_id")
    .notNull()
    .references(() => documents.id, { onDelete: "restrict" }),
  attachedByUserId: uuid("attached_by_user_id")
    .notNull()
    .references(() => applicationUsers.id, { onDelete: "restrict" }),
  attachedAt: timestamp("attached_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/** An underlying-rights source for a project. Status vocabulary is validated per stage by the service. */
export const projectRights = pgTable(
  "project_rights",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    rightsType: rightsType("rights_type").notNull(),
    status: rightsStatus("status").notNull(),
    rightsHolder: text("rights_holder"),
    expiryDate: date("expiry_date"),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("project_rights_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    check("project_rights_version_positive", sql`${table.version} > 0`),
  ],
);

export const projectRightDocuments = pgTable(
  "project_right_documents",
  {
    rightId: uuid("right_id")
      .notNull()
      .references(() => projectRights.id, { onDelete: "restrict" }),
    ...attachmentColumns,
  },
  (table) => [
    primaryKey({ columns: [table.rightId, table.documentLineageId] }),
    index("project_right_documents_lineage_idx").on(table.documentLineageId),
  ],
);

/** Category-specific legal details; the shape is validated by the contracts' discriminated union. */
export type LegalDetailsJson = { category: string } & Record<string, unknown>;

/**
 * A legal/documentation entity of one category (a writer, an investor, a
 * bank…). It has no stored status: confirmation is derived from the statuses
 * of its attached documents, per the product rule in the shared contracts.
 */
export const legalRecords = pgTable(
  "legal_records",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    category: legalCategory("category").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
    details: jsonb("details").$type<LegalDetailsJson>().notNull(),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => applicationUsers.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("legal_records_project_category_created_idx").on(
      table.projectId,
      table.category,
      table.createdAt,
    ),
    check("legal_records_version_positive", sql`${table.version} > 0`),
    check(
      "legal_records_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "legal_records_details_is_object",
      sql`jsonb_typeof(${table.details}) = 'object'`,
    ),
    check(
      "legal_records_details_category_matches",
      sql`${table.details}->>'category' = ${table.category}::text`,
    ),
  ],
);

export const legalRecordDocuments = pgTable(
  "legal_record_documents",
  {
    legalRecordId: uuid("legal_record_id")
      .notNull()
      .references(() => legalRecords.id, { onDelete: "restrict" }),
    ...attachmentColumns,
  },
  (table) => [
    primaryKey({ columns: [table.legalRecordId, table.documentLineageId] }),
    index("legal_record_documents_lineage_idx").on(table.documentLineageId),
  ],
);

export const applicationUsersRelations = relations(
  applicationUsers,
  ({ many }) => ({
    createdProjects: many(projects),
  }),
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  createdBy: one(applicationUsers, {
    fields: [projects.createdByUserId],
    references: [applicationUsers.id],
  }),
  stageHistory: many(projectStageHistory),
}));

export type ApplicationUserRow = typeof applicationUsers.$inferSelect;
export type UserCredentialRow = typeof userCredentials.$inferSelect;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type FileObjectRow = typeof fileObjects.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type ProjectEvaluationRow = typeof projectEvaluations.$inferSelect;
export type ProjectReviewRow = typeof projectReviews.$inferSelect;
export type ProjectNoteRow = typeof projectNotes.$inferSelect;
export type ProjectTaskRow = typeof projectTasks.$inferSelect;
export type ProjectPersonRow = typeof projectPeople.$inferSelect;
export type ProjectRightRow = typeof projectRights.$inferSelect;
export type LegalRecordRow = typeof legalRecords.$inferSelect;
export type ProjectPersonDocumentRow =
  typeof projectPersonDocuments.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;

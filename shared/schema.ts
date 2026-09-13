import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
export type ProjectRow = typeof projects.$inferSelect;

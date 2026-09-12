CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TYPE "public"."application_role" AS ENUM('studio_admin', 'user');
--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');
--> statement-breakpoint
CREATE TYPE "public"."project_stage" AS ENUM('evaluation', 'development', 'production');
--> statement-breakpoint
CREATE TYPE "public"."archive_reason" AS ENUM('creative_pass', 'commercial_viability', 'financing_not_secured', 'rights_legal_issues', 'packaging_fell_through', 'paused_strategic_timing', 'produced_completed', 'withdrawn');
--> statement-breakpoint
CREATE TYPE "public"."revisit_disposition" AS ENUM('yes', 'maybe', 'no');
--> statement-breakpoint
CREATE TABLE "application_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "clerk_user_id" text NOT NULL,
  "email" text,
  "display_name" text,
  "role" "application_role" DEFAULT 'user' NOT NULL,
  "status" "user_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "application_users_clerk_user_id_unique" ON "application_users" USING btree ("clerk_user_id");
--> statement-breakpoint
CREATE INDEX "application_users_status_idx" ON "application_users" USING btree ("status");
--> statement-breakpoint
CREATE TABLE "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "logline" text,
  "synopsis" text,
  "genre" text,
  "stage" "project_stage" DEFAULT 'evaluation' NOT NULL,
  "archived_at" timestamp with time zone,
  "archive_reason" "archive_reason",
  "archive_revisit" "revisit_disposition",
  "archive_starred" boolean,
  "archive_notes" text,
  "archived_from_stage" "project_stage",
  "deleted_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "projects_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX "projects_active_updated_at_idx" ON "projects" USING btree ("deleted_at","archived_at","updated_at");
--> statement-breakpoint
CREATE INDEX "projects_created_by_user_id_idx" ON "projects" USING btree ("created_by_user_id");
--> statement-breakpoint
CREATE TABLE "project_stage_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "from_stage" "project_stage",
  "to_stage" "project_stage" NOT NULL,
  "transition_type" text NOT NULL,
  "note" text,
  "actor_user_id" uuid NOT NULL,
  "request_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_stage_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict,
  CONSTRAINT "project_stage_history_actor_user_id_application_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX "project_stage_history_project_created_idx" ON "project_stage_history" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "request_id" uuid NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_events_actor_user_id_application_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX "audit_events_entity_created_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at");
--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_idx" ON "audit_events" USING btree ("actor_user_id","created_at");
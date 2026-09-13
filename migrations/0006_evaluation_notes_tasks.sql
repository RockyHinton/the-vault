CREATE TYPE "public"."finance_type" AS ENUM('grant', 'subsidy', 'equity', 'loan', 'pre_sale', 'deferral');--> statement-breakpoint
CREATE TYPE "public"."note_category" AS ENUM('script', 'financing', 'cast', 'other');--> statement-breakpoint
CREATE TYPE "public"."review_recommendation" AS ENUM('pass', 'consider', 'develop');--> statement-breakpoint
CREATE TYPE "public"."task_category" AS ENUM('finance', 'talent', 'legal', 'production', 'general');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TABLE "project_evaluations" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"writer" text,
	"director" text,
	"planned_budget" text,
	"finance_types" "finance_type"[] DEFAULT '{}' NOT NULL,
	"script_approved" boolean DEFAULT false NOT NULL,
	"budget_approved" boolean DEFAULT false NOT NULL,
	"finance_approved" boolean DEFAULT false NOT NULL,
	"talent_attached" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_evaluations_version_positive" CHECK ("project_evaluations"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"category" "note_category" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_notes_version_positive" CHECK ("project_notes"."version" > 0),
	CONSTRAINT "project_notes_body_not_blank" CHECK (length(btrim("project_notes"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "project_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"script_score" integer NOT NULL,
	"director_score" integer NOT NULL,
	"cast_score" integer NOT NULL,
	"financing_score" integer NOT NULL,
	"recommendation" "review_recommendation" NOT NULL,
	"summary_notes" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_reviews_version_positive" CHECK ("project_reviews"."version" > 0),
	CONSTRAINT "project_reviews_scores_in_range" CHECK ("project_reviews"."script_score" BETWEEN 0 AND 10 AND "project_reviews"."director_score" BETWEEN 0 AND 10 AND "project_reviews"."cast_score" BETWEEN 0 AND 10 AND "project_reviews"."financing_score" BETWEEN 0 AND 10),
	CONSTRAINT "project_reviews_summary_not_blank" CHECK (length(btrim("project_reviews"."summary_notes")) > 0)
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "task_category" DEFAULT 'general' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"assignee_user_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_tasks_version_positive" CHECK ("project_tasks"."version" > 0),
	CONSTRAINT "project_tasks_title_not_blank" CHECK (length(btrim("project_tasks"."title")) > 0),
	CONSTRAINT "project_tasks_completed_at_matches_status" CHECK (("project_tasks"."status" = 'done' AND "project_tasks"."completed_at" IS NOT NULL) OR ("project_tasks"."status" = 'open' AND "project_tasks"."completed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "project_evaluations" ADD CONSTRAINT "project_evaluations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_evaluations" ADD CONSTRAINT "project_evaluations_updated_by_user_id_application_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_author_user_id_application_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_reviews" ADD CONSTRAINT "project_reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_reviews" ADD CONSTRAINT "project_reviews_author_user_id_application_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_user_id_application_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_notes_project_created_idx" ON "project_notes" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_reviews_project_author_unique" ON "project_reviews" USING btree ("project_id","author_user_id");--> statement-breakpoint
CREATE INDEX "project_tasks_project_status_created_idx" ON "project_tasks" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "project_tasks_assignee_idx" ON "project_tasks" USING btree ("assignee_user_id");
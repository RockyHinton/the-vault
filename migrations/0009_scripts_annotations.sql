CREATE TYPE "public"."annotation_tag" AS ENUM('dialogue', 'structure', 'character', 'pacing', 'budget_impact', 'other');--> statement-breakpoint
CREATE TYPE "public"."annotation_type" AS ENUM('creative', 'commercial', 'question', 'concern');--> statement-breakpoint
CREATE TABLE "script_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"position_x" numeric(5, 2) NOT NULL,
	"position_y" numeric(5, 2) NOT NULL,
	"note_type" "annotation_type" NOT NULL,
	"tag" "annotation_tag",
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_annotations_version_positive" CHECK ("script_annotations"."version" > 0),
	CONSTRAINT "script_annotations_page_positive" CHECK ("script_annotations"."page_number" > 0),
	CONSTRAINT "script_annotations_position_in_page" CHECK ("script_annotations"."position_x" BETWEEN 0 AND 100 AND "script_annotations"."position_y" BETWEEN 0 AND 100),
	CONSTRAINT "script_annotations_body_not_blank" CHECK (length(btrim("script_annotations"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"document_lineage_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "script_annotations" ADD CONSTRAINT "script_annotations_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_annotations" ADD CONSTRAINT "script_annotations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_annotations" ADD CONSTRAINT "script_annotations_author_user_id_application_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_document_lineage_id_documents_id_fk" FOREIGN KEY ("document_lineage_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "script_annotations_document_page_idx" ON "script_annotations" USING btree ("document_id","page_number","created_at");--> statement-breakpoint
CREATE INDEX "script_annotations_script_idx" ON "script_annotations" USING btree ("script_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scripts_document_lineage_unique" ON "scripts" USING btree ("document_lineage_id");--> statement-breakpoint
CREATE INDEX "scripts_project_created_idx" ON "scripts" USING btree ("project_id","created_at");
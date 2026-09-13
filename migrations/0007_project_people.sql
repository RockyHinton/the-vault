CREATE TYPE "public"."contract_status" AS ENUM('not_sent', 'sent', 'signed', 'pending_amendments');--> statement-breakpoint
CREATE TYPE "public"."creative_role_type" AS ENUM('director', 'cast', 'head_of_department');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('identified', 'contacted', 'interested', 'offered', 'confirmed', 'contracted', 'attached', 'unavailable_passed');--> statement-breakpoint
CREATE TYPE "public"."person_kind" AS ENUM('producer', 'creative');--> statement-breakpoint
CREATE TABLE "project_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "person_kind" NOT NULL,
	"name" text NOT NULL,
	"role_title" text NOT NULL,
	"company" text,
	"creative_role_type" "creative_role_type",
	"agent" text,
	"contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"engagement_status" "engagement_status",
	"role_on_project" text,
	"start_date" date,
	"contract_status" "contract_status",
	"engagement_notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_people_version_positive" CHECK ("project_people"."version" > 0),
	CONSTRAINT "project_people_name_not_blank" CHECK (length(btrim("project_people"."name")) > 0),
	CONSTRAINT "project_people_role_title_not_blank" CHECK (length(btrim("project_people"."role_title")) > 0),
	CONSTRAINT "project_people_producer_has_company" CHECK ("project_people"."kind" <> 'producer' OR "project_people"."company" IS NOT NULL),
	CONSTRAINT "project_people_creative_role_type_matches_kind" CHECK (("project_people"."kind" = 'creative') = ("project_people"."creative_role_type" IS NOT NULL)),
	CONSTRAINT "project_people_contacts_is_array" CHECK (jsonb_typeof("project_people"."contacts") = 'array'),
	CONSTRAINT "project_people_links_is_array" CHECK (jsonb_typeof("project_people"."links") = 'array')
);
--> statement-breakpoint
CREATE TABLE "project_person_documents" (
	"person_id" uuid NOT NULL,
	"document_lineage_id" uuid NOT NULL,
	"attached_by_user_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_person_documents_person_id_document_lineage_id_pk" PRIMARY KEY("person_id","document_lineage_id")
);
--> statement-breakpoint
ALTER TABLE "project_people" ADD CONSTRAINT "project_people_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_people" ADD CONSTRAINT "project_people_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_person_documents" ADD CONSTRAINT "project_person_documents_person_id_project_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."project_people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_person_documents" ADD CONSTRAINT "project_person_documents_document_lineage_id_documents_id_fk" FOREIGN KEY ("document_lineage_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_person_documents" ADD CONSTRAINT "project_person_documents_attached_by_user_id_application_users_id_fk" FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_people_project_kind_created_idx" ON "project_people" USING btree ("project_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "project_person_documents_lineage_idx" ON "project_person_documents" USING btree ("document_lineage_id");
CREATE TYPE "public"."document_status" AS ENUM('draft', 'under_review', 'final', 'signed');--> statement-breakpoint
CREATE TYPE "public"."file_object_status" AS ENUM('staged', 'available', 'deleted');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lineage_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"file_object_id" uuid NOT NULL,
	"folder" text NOT NULL,
	"title" text NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_version_positive" CHECK ("documents"."version" > 0),
	CONSTRAINT "documents_version_number_positive" CHECK ("documents"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "file_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" "file_object_status" DEFAULT 'staged' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "file_objects_byte_size_positive" CHECK ("file_objects"."byte_size" > 0),
	CONSTRAINT "file_objects_sha256_shape" CHECK ("file_objects"."sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_lineage_id_documents_id_fk" FOREIGN KEY ("lineage_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_object_id_file_objects_id_fk" FOREIGN KEY ("file_object_id") REFERENCES "public"."file_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_file_object_id_unique" ON "documents" USING btree ("file_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_lineage_version_unique" ON "documents" USING btree ("lineage_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_lineage_current_unique" ON "documents" USING btree ("lineage_id") WHERE "documents"."is_current" = true AND "documents"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "documents_project_folder_idx" ON "documents" USING btree ("project_id","folder");--> statement-breakpoint
CREATE INDEX "documents_lineage_idx" ON "documents" USING btree ("lineage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_objects_storage_key_unique" ON "file_objects" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "file_objects_status_created_idx" ON "file_objects" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "file_objects_created_by_user_id_idx" ON "file_objects" USING btree ("created_by_user_id");
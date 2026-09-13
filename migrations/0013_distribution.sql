CREATE TYPE "public"."distribution_territory_status" AS ENUM('available', 'in_discussion', 'licensed', 'delivered', 'closed');--> statement-breakpoint
CREATE TABLE "distribution_territories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "distribution_territory_status" DEFAULT 'available' NOT NULL,
	"distributor" text,
	"contact" text,
	"signature_payment" text,
	"delivery_payment" text,
	"general_notes" text,
	"created_by_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_territories_version_positive" CHECK ("distribution_territories"."version" > 0),
	CONSTRAINT "distribution_territories_name_not_blank" CHECK (length(btrim("distribution_territories"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "distribution_territory_documents" (
	"territory_id" uuid NOT NULL,
	"document_lineage_id" uuid NOT NULL,
	"attached_by_user_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_territory_documents_territory_id_document_lineage_id_pk" PRIMARY KEY("territory_id","document_lineage_id")
);
--> statement-breakpoint
CREATE TABLE "distribution_territory_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"territory_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_territory_notes_version_positive" CHECK ("distribution_territory_notes"."version" > 0),
	CONSTRAINT "distribution_territory_notes_body_not_blank" CHECK (length(btrim("distribution_territory_notes"."body")) > 0)
);
--> statement-breakpoint
ALTER TABLE "distribution_territories" ADD CONSTRAINT "distribution_territories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_territories" ADD CONSTRAINT "distribution_territories_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_territory_documents" ADD CONSTRAINT "distribution_territory_documents_territory_id_distribution_territories_id_fk" FOREIGN KEY ("territory_id") REFERENCES "public"."distribution_territories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_territory_documents" ADD CONSTRAINT "distribution_territory_documents_document_lineage_id_documents_id_fk" FOREIGN KEY ("document_lineage_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_territory_documents" ADD CONSTRAINT "distribution_territory_documents_attached_by_user_id_application_users_id_fk" FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_territory_notes" ADD CONSTRAINT "distribution_territory_notes_territory_id_distribution_territories_id_fk" FOREIGN KEY ("territory_id") REFERENCES "public"."distribution_territories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_territory_notes" ADD CONSTRAINT "distribution_territory_notes_author_user_id_application_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "distribution_territories_project_name_unique" ON "distribution_territories" USING btree ("project_id",lower("name")) WHERE "distribution_territories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "distribution_territories_project_created_idx" ON "distribution_territories" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "distribution_territory_documents_lineage_idx" ON "distribution_territory_documents" USING btree ("document_lineage_id");--> statement-breakpoint
CREATE INDEX "distribution_territory_notes_territory_created_idx" ON "distribution_territory_notes" USING btree ("territory_id","created_at");
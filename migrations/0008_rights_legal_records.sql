CREATE TYPE "public"."legal_category" AS ENUM('chain_of_title', 'writer_agreements', 'investment_agreements', 'co_production', 'producers_agreements', 'director_agreements', 'cast_agreements', 'banking_docs', 'funding_tax_credit', 'sales_agency', 'cama');--> statement-breakpoint
CREATE TYPE "public"."rights_status" AS ENUM('identified', 'contacted', 'under_review', 'option_pending', 'optioned', 'not_available', 'extended', 'purchase_pending', 'purchased', 'rights_issue', 'cleared', 'chain_complete', 'missing_doc', 'expired', 'legal_hold');--> statement-breakpoint
CREATE TYPE "public"."rights_type" AS ENUM('original', 'book', 'article', 'life_rights', 'remake', 'other');--> statement-breakpoint
CREATE TABLE "legal_record_documents" (
	"legal_record_id" uuid NOT NULL,
	"document_lineage_id" uuid NOT NULL,
	"attached_by_user_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_record_documents_legal_record_id_document_lineage_id_pk" PRIMARY KEY("legal_record_id","document_lineage_id")
);
--> statement-breakpoint
CREATE TABLE "legal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" "legal_category" NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"details" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_records_version_positive" CHECK ("legal_records"."version" > 0),
	CONSTRAINT "legal_records_name_not_blank" CHECK (length(btrim("legal_records"."name")) > 0),
	CONSTRAINT "legal_records_details_is_object" CHECK (jsonb_typeof("legal_records"."details") = 'object'),
	CONSTRAINT "legal_records_details_category_matches" CHECK ("legal_records"."details"->>'category' = "legal_records"."category"::text)
);
--> statement-breakpoint
CREATE TABLE "project_right_documents" (
	"right_id" uuid NOT NULL,
	"document_lineage_id" uuid NOT NULL,
	"attached_by_user_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_right_documents_right_id_document_lineage_id_pk" PRIMARY KEY("right_id","document_lineage_id")
);
--> statement-breakpoint
CREATE TABLE "project_rights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"rights_type" "rights_type" NOT NULL,
	"status" "rights_status" NOT NULL,
	"rights_holder" text,
	"expiry_date" date,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_rights_version_positive" CHECK ("project_rights"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "legal_record_documents" ADD CONSTRAINT "legal_record_documents_legal_record_id_legal_records_id_fk" FOREIGN KEY ("legal_record_id") REFERENCES "public"."legal_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_record_documents" ADD CONSTRAINT "legal_record_documents_document_lineage_id_documents_id_fk" FOREIGN KEY ("document_lineage_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_record_documents" ADD CONSTRAINT "legal_record_documents_attached_by_user_id_application_users_id_fk" FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_records" ADD CONSTRAINT "legal_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_records" ADD CONSTRAINT "legal_records_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_right_documents" ADD CONSTRAINT "project_right_documents_right_id_project_rights_id_fk" FOREIGN KEY ("right_id") REFERENCES "public"."project_rights"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_right_documents" ADD CONSTRAINT "project_right_documents_document_lineage_id_documents_id_fk" FOREIGN KEY ("document_lineage_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_right_documents" ADD CONSTRAINT "project_right_documents_attached_by_user_id_application_users_id_fk" FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_rights" ADD CONSTRAINT "project_rights_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_rights" ADD CONSTRAINT "project_rights_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_record_documents_lineage_idx" ON "legal_record_documents" USING btree ("document_lineage_id");--> statement-breakpoint
CREATE INDEX "legal_records_project_category_created_idx" ON "legal_records" USING btree ("project_id","category","created_at");--> statement-breakpoint
CREATE INDEX "project_right_documents_lineage_idx" ON "project_right_documents" USING btree ("document_lineage_id");--> statement-breakpoint
CREATE INDEX "project_rights_project_created_idx" ON "project_rights" USING btree ("project_id","created_at");
CREATE TYPE "public"."finance_source_status" AS ENUM('targeted', 'soft_committed', 'approved');--> statement-breakpoint
CREATE TYPE "public"."finance_source_type" AS ENUM('equity', 'pre_sale', 'distributor_mg', 'grant', 'tax_credit', 'loan', 'gap_finance', 'other');--> statement-breakpoint
CREATE TABLE "finance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"budget_version_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_plans_version_positive" CHECK ("finance_plans"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "finance_source_documents" (
	"finance_source_id" uuid NOT NULL,
	"document_lineage_id" uuid NOT NULL,
	"attached_by_user_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_source_documents_finance_source_id_document_lineage_id_pk" PRIMARY KEY("finance_source_id","document_lineage_id")
);
--> statement-breakpoint
CREATE TABLE "finance_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finance_plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "finance_source_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" "finance_source_status" DEFAULT 'targeted' NOT NULL,
	"expected_date" date,
	"notes" text,
	"position" integer NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_sources_version_positive" CHECK ("finance_sources"."version" > 0),
	CONSTRAINT "finance_sources_name_not_blank" CHECK (length(btrim("finance_sources"."name")) > 0),
	CONSTRAINT "finance_sources_amount_non_negative" CHECK ("finance_sources"."amount" >= 0),
	CONSTRAINT "finance_sources_position_non_negative" CHECK ("finance_sources"."position" >= 0),
	CONSTRAINT "finance_sources_approval_matches_status" CHECK (("finance_sources"."status" = 'approved') = ("finance_sources"."approved_at" IS NOT NULL) AND ("finance_sources"."approved_at" IS NULL) = ("finance_sources"."approved_by_user_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "finance_plans" ADD CONSTRAINT "finance_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_plans" ADD CONSTRAINT "finance_plans_budget_version_id_budget_versions_id_fk" FOREIGN KEY ("budget_version_id") REFERENCES "public"."budget_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_plans" ADD CONSTRAINT "finance_plans_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_source_documents" ADD CONSTRAINT "finance_source_documents_finance_source_id_finance_sources_id_fk" FOREIGN KEY ("finance_source_id") REFERENCES "public"."finance_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_source_documents" ADD CONSTRAINT "finance_source_documents_document_lineage_id_documents_id_fk" FOREIGN KEY ("document_lineage_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_source_documents" ADD CONSTRAINT "finance_source_documents_attached_by_user_id_application_users_id_fk" FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_sources" ADD CONSTRAINT "finance_sources_finance_plan_id_finance_plans_id_fk" FOREIGN KEY ("finance_plan_id") REFERENCES "public"."finance_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_sources" ADD CONSTRAINT "finance_sources_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_sources" ADD CONSTRAINT "finance_sources_approved_by_user_id_application_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_plans_project_unique" ON "finance_plans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "finance_source_documents_lineage_idx" ON "finance_source_documents" USING btree ("document_lineage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_sources_plan_position_unique" ON "finance_sources" USING btree ("finance_plan_id","position");
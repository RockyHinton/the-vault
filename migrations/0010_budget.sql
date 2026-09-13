CREATE TYPE "public"."budget_version_status" AS ENUM('draft', 'awaiting_approval', 'locked');--> statement-breakpoint
CREATE TYPE "public"."currency_code" AS ENUM('GBP', 'USD', 'EUR');--> statement-breakpoint
CREATE TABLE "budget_department_documents" (
	"budget_department_id" uuid NOT NULL,
	"document_lineage_id" uuid NOT NULL,
	"attached_by_user_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_department_documents_budget_department_id_document_lineage_id_pk" PRIMARY KEY("budget_department_id","document_lineage_id")
);
--> statement-breakpoint
CREATE TABLE "budget_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_departments_version_positive" CHECK ("budget_departments"."version" > 0),
	CONSTRAINT "budget_departments_name_not_blank" CHECK (length(btrim("budget_departments"."name")) > 0),
	CONSTRAINT "budget_departments_position_non_negative" CHECK ("budget_departments"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_department_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"note" text,
	"position" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_line_items_version_positive" CHECK ("budget_line_items"."version" > 0),
	CONSTRAINT "budget_line_items_name_not_blank" CHECK (length(btrim("budget_line_items"."name")) > 0),
	CONSTRAINT "budget_line_items_amount_non_negative" CHECK ("budget_line_items"."amount" >= 0),
	CONSTRAINT "budget_line_items_position_non_negative" CHECK ("budget_line_items"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "budget_version_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone,
	"locked_by_user_id" uuid,
	"locked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_versions_version_positive" CHECK ("budget_versions"."version" > 0),
	CONSTRAINT "budget_versions_number_positive" CHECK ("budget_versions"."version_number" > 0),
	CONSTRAINT "budget_versions_submitted_matches_status" CHECK (("budget_versions"."status" = 'draft') = ("budget_versions"."submitted_at" IS NULL) AND ("budget_versions"."submitted_at" IS NULL) = ("budget_versions"."submitted_by_user_id" IS NULL)),
	CONSTRAINT "budget_versions_locked_matches_status" CHECK (("budget_versions"."status" = 'locked') = ("budget_versions"."locked_at" IS NOT NULL) AND ("budget_versions"."locked_at" IS NULL) = ("budget_versions"."locked_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"currency" "currency_code" NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_department_documents" ADD CONSTRAINT "budget_department_documents_budget_department_id_budget_departments_id_fk" FOREIGN KEY ("budget_department_id") REFERENCES "public"."budget_departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_department_documents" ADD CONSTRAINT "budget_department_documents_document_lineage_id_documents_id_fk" FOREIGN KEY ("document_lineage_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_department_documents" ADD CONSTRAINT "budget_department_documents_attached_by_user_id_application_users_id_fk" FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_departments" ADD CONSTRAINT "budget_departments_budget_version_id_budget_versions_id_fk" FOREIGN KEY ("budget_version_id") REFERENCES "public"."budget_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_budget_department_id_budget_departments_id_fk" FOREIGN KEY ("budget_department_id") REFERENCES "public"."budget_departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_submitted_by_user_id_application_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_locked_by_user_id_application_users_id_fk" FOREIGN KEY ("locked_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_department_documents_lineage_idx" ON "budget_department_documents" USING btree ("document_lineage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_departments_version_name_unique" ON "budget_departments" USING btree ("budget_version_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "budget_departments_version_position_unique" ON "budget_departments" USING btree ("budget_version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_line_items_department_position_unique" ON "budget_line_items" USING btree ("budget_department_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_versions_budget_number_unique" ON "budget_versions" USING btree ("budget_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_versions_one_open_per_budget" ON "budget_versions" USING btree ("budget_id") WHERE "budget_versions"."status" <> 'locked';--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_project_unique" ON "budgets" USING btree ("project_id");
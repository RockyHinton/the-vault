CREATE TYPE "public"."cash_flow_direction" AS ENUM('inflow', 'outflow');--> statement-breakpoint
CREATE TYPE "public"."cash_flow_timeframe" AS ENUM('monthly', 'weekly');--> statement-breakpoint
CREATE TABLE "cash_flow_department_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_flow_id" uuid NOT NULL,
	"budget_department_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_flow_department_windows_version_positive" CHECK ("cash_flow_department_windows"."version" > 0),
	CONSTRAINT "cash_flow_department_windows_end_after_start" CHECK ("cash_flow_department_windows"."end_date" >= "cash_flow_department_windows"."start_date")
);
--> statement-breakpoint
CREATE TABLE "cash_flow_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_flow_id" uuid NOT NULL,
	"budget_department_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"direction" "cash_flow_direction" NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"created_by_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_flow_payments_version_positive" CHECK ("cash_flow_payments"."version" > 0),
	CONSTRAINT "cash_flow_payments_name_not_blank" CHECK (length(btrim("cash_flow_payments"."name")) > 0),
	CONSTRAINT "cash_flow_payments_amount_positive" CHECK ("cash_flow_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "cash_flow_source_timings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_flow_id" uuid NOT NULL,
	"finance_source_id" uuid NOT NULL,
	"expected_date" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_flow_source_timings_version_positive" CHECK ("cash_flow_source_timings"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "cash_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"finance_plan_id" uuid NOT NULL,
	"timeframe" "cash_flow_timeframe" DEFAULT 'monthly' NOT NULL,
	"opening_balance" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_flows_version_positive" CHECK ("cash_flows"."version" > 0),
	CONSTRAINT "cash_flows_opening_balance_non_negative" CHECK ("cash_flows"."opening_balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cash_flow_department_windows" ADD CONSTRAINT "cash_flow_department_windows_cash_flow_id_cash_flows_id_fk" FOREIGN KEY ("cash_flow_id") REFERENCES "public"."cash_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_department_windows" ADD CONSTRAINT "cash_flow_department_windows_budget_department_id_budget_departments_id_fk" FOREIGN KEY ("budget_department_id") REFERENCES "public"."budget_departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_payments" ADD CONSTRAINT "cash_flow_payments_cash_flow_id_cash_flows_id_fk" FOREIGN KEY ("cash_flow_id") REFERENCES "public"."cash_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_payments" ADD CONSTRAINT "cash_flow_payments_budget_department_id_budget_departments_id_fk" FOREIGN KEY ("budget_department_id") REFERENCES "public"."budget_departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_payments" ADD CONSTRAINT "cash_flow_payments_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_source_timings" ADD CONSTRAINT "cash_flow_source_timings_cash_flow_id_cash_flows_id_fk" FOREIGN KEY ("cash_flow_id") REFERENCES "public"."cash_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_source_timings" ADD CONSTRAINT "cash_flow_source_timings_finance_source_id_finance_sources_id_fk" FOREIGN KEY ("finance_source_id") REFERENCES "public"."finance_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_finance_plan_id_finance_plans_id_fk" FOREIGN KEY ("finance_plan_id") REFERENCES "public"."finance_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_created_by_user_id_application_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."application_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_flow_department_windows_department_unique" ON "cash_flow_department_windows" USING btree ("cash_flow_id","budget_department_id");--> statement-breakpoint
CREATE INDEX "cash_flow_payments_cash_flow_idx" ON "cash_flow_payments" USING btree ("cash_flow_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_flow_source_timings_source_unique" ON "cash_flow_source_timings" USING btree ("cash_flow_id","finance_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_flows_project_unique" ON "cash_flows" USING btree ("project_id");
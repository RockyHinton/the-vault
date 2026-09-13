ALTER TABLE "application_users" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "application_users_email_lower_unique" ON "application_users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "application_users" ADD CONSTRAINT "application_users_version_positive" CHECK ("application_users"."version" > 0);
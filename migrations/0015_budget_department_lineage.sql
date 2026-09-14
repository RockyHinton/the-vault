-- Department lineage: the stable identity of "the same department" across budget versions.
-- Existing departments start their own lineage (lineage_id = id). No correspondence between
-- earlier revisions is inferred, so cash-flow scheduling that predates this migration can only
-- surface as unassigned after a rebase; it is never remapped by guesswork.
ALTER TABLE "budget_departments" ADD COLUMN "lineage_id" uuid;--> statement-breakpoint
UPDATE "budget_departments" SET "lineage_id" = "id";--> statement-breakpoint
ALTER TABLE "budget_departments" ALTER COLUMN "lineage_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_departments_version_lineage_unique" ON "budget_departments" USING btree ("budget_version_id","lineage_id");

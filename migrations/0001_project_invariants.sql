ALTER TABLE "projects"
  ADD CONSTRAINT "projects_version_positive"
  CHECK ("version" > 0);

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_archive_fields_coherent"
  CHECK (
    (
      "archived_at" IS NULL
      AND "archive_reason" IS NULL
      AND "archive_revisit" IS NULL
      AND "archive_starred" IS NULL
      AND "archive_notes" IS NULL
      AND "archived_from_stage" IS NULL
    )
    OR (
      "archived_at" IS NOT NULL
      AND "archive_reason" IS NOT NULL
      AND "archive_revisit" IS NOT NULL
      AND "archive_starred" IS NOT NULL
      AND "archived_from_stage" IS NOT NULL
    )
  );

ALTER TABLE "project_stage_history"
  ADD CONSTRAINT "project_stage_history_created_shape"
  CHECK (
    ("transition_type" = 'created' AND "from_stage" IS NULL)
    OR ("transition_type" <> 'created' AND "from_stage" IS NOT NULL)
  );
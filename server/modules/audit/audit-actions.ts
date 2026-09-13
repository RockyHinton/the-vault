/**
 * The canonical audit vocabulary. `appendAuditEvent` accepts only these
 * names, so a typo in a new command is a compile error rather than a new
 * entry in the trail. Add a domain's actions here when the domain is added;
 * keep them `<entity>.<past-tense verb>`.
 *
 * Persisted strings are never renamed. Two names predate the past-tense
 * convention and stay as they are for historical consistency:
 * `cash_flow_department_window.set` and `cash_flow_source_timing.set`.
 */
export const auditActions = [
  // auth
  "auth.login",
  "auth.logout",
  // users
  "user.bootstrap_admin_created",
  "user.provisioned",
  "user.role_changed",
  "user.suspended",
  "user.reinstated",
  // projects
  "project.created",
  "project.updated",
  "project.stage_changed",
  "project.archived",
  "project.restored",
  "project.deleted",
  // documents
  "document.created",
  "document.version_added",
  "document.updated",
  "document.deleted",
  // evaluation
  "evaluation.created",
  "evaluation.updated",
  "review.submitted",
  "review.updated",
  "review.deleted",
  // notes
  "note.created",
  "note.updated",
  "note.deleted",
  // tasks
  "task.created",
  "task.updated",
  "task.completed",
  "task.reopened",
  "task.deleted",
  // people
  "person.created",
  "person.updated",
  "person.status_changed",
  "person.deleted",
  "person.document_attached",
  "person.document_detached",
  // rights
  "right.created",
  "right.updated",
  "right.status_changed",
  "right.deleted",
  "right.document_attached",
  "right.document_detached",
  // legal
  "legal_record.created",
  "legal_record.updated",
  "legal_record.deleted",
  "legal_record.document_attached",
  "legal_record.document_detached",
  // scripts
  "script.created",
  "script.version_added",
  "script.deleted",
  "script_annotation.created",
  "script_annotation.updated",
  "script_annotation.deleted",
  // budget
  "budget.created",
  "budget_version.created",
  "budget_version.submitted",
  "budget_version.locked",
  "budget_department.created",
  "budget_department.updated",
  "budget_department.deleted",
  "budget_department.document_attached",
  "budget_department.document_detached",
  "budget_line_item.created",
  "budget_line_item.updated",
  "budget_line_item.deleted",
  // finance plan
  "finance_plan.created",
  "finance_plan.rebased",
  "finance_source.created",
  "finance_source.updated",
  "finance_source.status_changed",
  "finance_source.approved",
  "finance_source.deleted",
  "finance_source.document_attached",
  "finance_source.document_detached",
  // cash flow (legacy `.set` names retained)
  "cash_flow.created",
  "cash_flow.updated",
  "cash_flow_department_window.set",
  "cash_flow_department_window.cleared",
  "cash_flow_payment.created",
  "cash_flow_payment.updated",
  "cash_flow_payment.deleted",
  "cash_flow_source_timing.set",
  "cash_flow_source_timing.cleared",
  // distribution
  "distribution_territory.created",
  "distribution_territory.updated",
  "distribution_territory.status_changed",
  "distribution_territory.deleted",
  "distribution_territory.document_attached",
  "distribution_territory.document_detached",
  "distribution_territory_note.created",
  "distribution_territory_note.updated",
  "distribution_territory_note.deleted",
] as const;

export type AuditAction = (typeof auditActions)[number];

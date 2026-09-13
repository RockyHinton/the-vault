# ADR 0009: Authored records, actor references and assignment

Date: 2026-09-13. Status: accepted.

## Context

The Evaluation stage moved three prototype areas onto the backend: the project evaluation
profile with its decision gates, team reviews, project notes and project tasks. The prototype
stored author display names on records, used a fixture actor for ownership, kept the decision
checklist in component state, assigned tasks by free-text name and toggled task status in
place. Later domains (People, Rights, Scripts, Finance) will have the same shapes, so the
rules needed to be decided once.

## Decision

1. **Authorship is a foreign key resolved from the session.** Authored rows carry
   `author_user_id` (or `created_by_user_id`) referencing `application_users` with
   `ON DELETE RESTRICT`. Request bodies never name an author. Display names are joined at read
   time and never stored on records.
2. **Actors cross the wire as `UserRef { id, displayName }`.** Email and role are not part of
   an actor reference; `auditActorSchema` (admin-only) is the one exception and is documented
   as such.
3. **Assignment is a foreign key to an active user.** `project_tasks.assignee_user_id` is
   nullable and validated by the service (`422 ASSIGNEE_NOT_ASSIGNABLE`). The assignment
   picker reads `GET /users/directory`, which any signed-in user may call and which returns
   `UserRef`s only.
4. **Author-or-admin is the default policy for authored records,** expressed as one
   `assertCanManage` per service. Collaborative exceptions are explicit per command (task
   complete, reopen and reassign are open to every active user).
5. **One review per author per project is enforced by a PostgreSQL unique index** and exposed
   as an idempotent `PUT …/reviews/mine` with `version: 0` meaning "create".
6. **Lifecycle transitions are commands, not field updates.** Task status moves only through
   `complete` and `reopen`; the `status`/`completed_at` pair is a CHECK constraint; each
   command has its own audit action.
7. **The decision checklist is persisted as four gate columns on the evaluation aggregate**
   rather than removed or derived, because it gates a real lifecycle command (approve for
   development) and its state must survive a reload and be visible to the whole team.
   Deriving it from other domains was rejected: those domains do not exist yet and the gate
   semantics ("budget approved") are a human decision, not a computation.

## Consequences

- New authored domains copy Notes (per-user content), Tasks (assignment and commands) or
  Evaluation (1:1 project aggregate) instead of inventing policy.
- Suspending a user never orphans records; the restrict FK keeps history intact.
- Reviews are hard-deleted (an opinion, not provenance); notes and tasks are soft-deleted so
  audit subjects remain resolvable.
- Fields the prototype carried without a writer (`financeStatus`, `castAttached`, `producers`,
  score variants, task `dueDate`, `In Progress`) were not migrated; a future domain that needs
  them adds them deliberately.

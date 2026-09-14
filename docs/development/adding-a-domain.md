# Adding a domain

A checklist, not a tutorial. Read [../architecture/domain-pattern.md](../architecture/domain-pattern.md)
first and open `server/modules/people` beside it.

1. **Inspect the product first.** Read the current screen and its consumers. List which
   fields have real writers, which are derived, which are fixtures to delete. Decide
   whether a concept is an aggregate, a child row, or a field. Do not translate UI state into
   tables mechanically.
2. **Contracts** (`shared/contracts/api.ts`): response schema, create schema, update schema
   (with `version`, at least one field), one command schema per lifecycle step, param schemas.
   Enums here; `pgEnum` mirrors them. Money uses `moneySchema` / `moneyValueSchema`; dates
   use `isoDateSchema`; actors are `userRefSchema`; embedded documents are `documentSchema`.
3. **Schema** (`shared/schema.ts`): `project_id` FK (or ownership through a parent),
   `created_by_user_id` FK, `version`, `deleted_at` if the record is history-bearing, CHECKs
   for shape and status↔timestamp rules, unique indexes for real business rules, indexes for
   the queries you will write. Documents: a join table with the shared `attachmentColumns`,
   registered in `server/modules/documents/document-attachments.ts`.
4. **Migration:** see [database-migrations.md](database-migrations.md).
5. **Repository:** executor-taking functions, project-scoped lookups, soft-delete filters,
   compare-and-set updates, narrow editable-field types, state-aware delete predicates.
6. **Service:** `create<Domain>Service({ db })`; per command one transaction, `require*`
   404s, `assertCan*` policy, `requireFresh` 409, audit inside; `to<Contract>` mappers with
   `toUserRef`. Wrap create-time uniqueness in `withUniqueViolationAsConflict`. Read other
   domains only through their repositories, inside your `tx`.
7. **Authorization:** decide deliberately and write it down in the service doc comment:
   collaborative edits, author/creator-or-admin removal, studio_admin for sign-offs. No new
   roles. See [../architecture/auth-and-authorization.md](../architecture/auth-and-authorization.md).
8. **Audit:** add the domain's action names to `server/modules/audit/audit-actions.ts`
   (`<entity>.<past-tense>`), one event per command, from/to metadata for money, status and
   names.
9. **Routes:** `validate` everything, actor from `req.localUser`, `handle`, envelope; mount
   in `server/routes.ts` behind `requireLocalUser`; construct the service in `server/app.ts`.
10. **Client:** `client/src/features/<domain>/` with `<domain>-api.ts`, `use-<domain>.ts`
    (root key, hooks, `useVaultMutation`, cache write-back for whole-aggregate responses) and
    `labels.ts`. If the domain embeds documents, add its root key to
    `document-owner-keys.ts`. Wire the view into the workspace shell; use `QueryState`,
    `CommitInput` / `MoneyInput`, `OwnerDocumentList`.
11. **Prototype removal:** delete what the domain replaces in the same change.
12. **Tests:** an integration suite covering create/read/scope (an id from project A through
    project B is 404), authorization for admin and user, each command, stale 409, constraint
    violations through raw SQL, audit rows and their absence on failure, documents if
    attached; enum parity comes for free if the enum is listed in
    `tests/unit/contract-enum-parity.test.ts`; one representative Playwright flow with a
    second user. See [testing.md](testing.md).
13. **Docs:** a short section in `docs/architecture/domain-reference.md` if the domain
    carries a rule others will copy; an ADR only for a genuinely new durable decision.
14. **Gates:** `npm run check`, `lint`, `format:check`, `test`, `test:e2e`, `build`,
    `git diff --check`, `npx drizzle-kit check`. Do not commit or push unless asked.

Before finishing: *if the next five domains copied this implementation, would the codebase
become better?* If not, improve it now.

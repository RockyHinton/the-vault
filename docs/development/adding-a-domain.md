# Adding a domain

A checklist for adding a new production domain to the full-stack application. Read
[../architecture/domain-pattern.md](../architecture/domain-pattern.md) first and keep
`server/modules/people` (the reference domain) and its suite
`tests/integration/people-postgres.test.ts` open beside you.

1. **Inspect the product.** Read the screens and every consumer of the concept. Decide what is
   an aggregate, a child row or a field, which values are authored (stored) and which are
   derived (computed on read, never stored), and which user actions are commands. Do not
   translate UI state into tables mechanically. *If the screen currently renders prototype or
   fixture data, remove that data in the same change; nothing fabricated survives.*
2. **Contracts** (`shared/contracts/api.ts`): response schema, create schema, update schema
   (editable fields only, plus `version` and an "at least one field" refinement), one schema
   per lifecycle command, param schemas. Declare enums here and mirror them as `pgEnum`s.
   Money uses `moneySchema` for input, `storedMoneyValueSchema` / `moneyTotalValueSchema` for
   output; dates use `isoDateSchema`; actors are `userRefSchema`; embedded documents are
   `documentSchema`.
3. **Schema** (`shared/schema.ts`): UUID key, `project_id` FK (or ownership through a parent),
   `created_by_user_id` FK, `version`, `deleted_at` if the record carries history, CHECKs for
   shape and status↔timestamp rules, unique indexes for real business rules, indexes for your
   queries, deliberate delete behaviour (`restrict` for anything historical). Documents: a
   `<owner>_documents` join table with the shared `attachmentColumns`, registered in
   `server/modules/documents/document-attachments.ts`.
4. **Migration:** generate, rename, review, replay; see
   [database-migrations.md](database-migrations.md).
5. **Repository:** executor-first functions; project-scoped lookups (join to the parent when
   the row has no `project_id`); soft-delete filters; compare-and-set updates on `id` +
   `version`; `Partial<Pick<Row, …>>` editable fields; state predicates in destructive SQL.
   No policy, no audit names, no transactions.
6. **Service** (`create<Domain>Service({ db })`): every command opens
   `withLiveProjectTransaction(db, projectId, …)` (lint enforces this in project-owned
   modules; add the new module to the rule in `eslint.config.js`), loads and scopes
   (`require*` → 404), checks policy (`assertCan*` → 403, state → 409/422), writes through the
   repository (`requireFresh` → 409), appends the audit event with the same `tx`, and returns
   the contract (`to<Contract>`, actors via `toUserRef`). Read other domains through their
   repositories inside the `tx`; wrap create-time uniqueness in
   `withUniqueViolationAsConflict`. To create a document with the record, call
   `createDocumentInTransaction` and insert the link through the attachment repository.
7. **Concurrency:** decide what `version` guards; add a row lock when a check spans rows
   (see Budget, Finance Plan); make every race-prone uniqueness rule a named index.
8. **Authorization:** decide per command and state it in the service doc comment:
   collaborative, author/creator-or-admin, or studio_admin sign-off. No new roles. See
   [../architecture/auth-and-authorization.md](../architecture/auth-and-authorization.md).
9. **Audit:** add `<entity>.<past-tense>` names to `server/modules/audit/audit-actions.ts`; one
   event per command, with from/to metadata for money, status and names.
10. **Routes:** `Router({ mergeParams: true })`, `validate` params and body, actor from
    `req.localUser`, `handle`, the `{ data, requestId }` envelope, `201` on create, `204` when
    the command deletes the addressed record or `200` with the updated aggregate when it
    removes part of one. Mount in `server/routes.ts` behind `requireLocalUser`; construct the
    service in `server/app.ts`.
11. **Client:** `client/src/features/<domain>/` with `<domain>-api.ts`, `use-<domain>.ts`
    (root query key, `useQuery` hooks with their own `queryFn`, `useVaultMutation`, cache
    write-back for whole-aggregate responses) and `labels.ts`. If the domain embeds documents,
    add its root key to `document-owner-keys.ts`. Views use `QueryState` (errors are not
    empty states), `CommitInput` / `MoneyInput`, `OwnerDocumentList`; drafts stay local.
12. **Tests:** an integration suite modelled on People: session actor captured, cross-project
    ids are 404, admin and user policy, every command, stale `409` with no side effects,
    constraint violations through raw SQL naming the constraint, audit present on success and
    absent on refusal, documents by lineage, a second user sees the same state, a write to a
    soft-deleted project refused. Add enum parity entries and one representative Playwright
    flow. See [testing.md](testing.md).
13. **Docs:** a short section in `docs/architecture/domain-reference.md` for rules others will
    copy; an ADR only for a genuinely new durable decision.
14. **Gates:** `npm run check`, `npm run lint`, `npm run format:check`, `npm test`,
    `npm run test:e2e`, `npm run build`, `git diff --check`, `npx drizzle-kit check`. Do not
    commit or push unless asked.

Before finishing: *if the next five domains copied this implementation, would the codebase
become better?* If not, improve it now.

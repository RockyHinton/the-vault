# Finance

```
Locked Budget Version ──▶ Finance Plan ──▶ Approved Finance Sources ──▶ Cash Flow ──▶ Financing Overview
(immutable baseline)     (one per project)  (immutable amounts)            (authored timing)   (derived, no table)
```

Every number in Finance is exact and every derived figure is computed on read from an
immutable or versioned input. Nothing stores a total, a gap or a balance. See ADR 0011.

## Budget

Finance is one bounded context built as separate subdomains. The Budget is the first and
sets the money conventions the later Finance Plan and Cash Flow modules follow (ADR 0011).

- **Money.** `numeric(14,2)` in PostgreSQL, decimal strings such as `"125000.00"` on the wire
  (`moneySchema` normalises authored input; `moneyValueSchema` describes server output), and
  `shared/contracts/money.ts` for exact BigInt-cents sums and float-free formatting on the
  client. Totals are never stored: PostgreSQL sums line items per department and per version
  (`totalsByDepartment`, `totalsByVersion`) and the API returns them as strings. Nothing in the
  product converts money through `Number`.
- **Currency** lives once, on `budgets.currency` (`currency_code` enum), fixed for every
  version. There is no FX and no per-line currency.
- **Budget vs version.** `budgets` is the stable project concept (one per project);
  `budget_versions` are numbered revisions with a status (`draft`, `awaiting_approval`,
  `locked`), the actors and timestamps of each lifecycle step, and an optimistic `version` for
  lifecycle commands. Departments and line items belong to exactly one budget version; a
  revision copies them. A partial unique index allows at most one non-locked version per
  budget, and CHECK constraints tie `submitted_*` and `locked_*` to the status.
- **Locked means immutable.** Every content command takes the version's row lock
  (`SELECT … FOR UPDATE`) and then requires status `draft` (`409
  BUDGET_VERSION_NOT_EDITABLE`), so a concurrent submit or lock cannot slip in between the
  check and the write. Locked versions are never written again; the only way forward is
  `POST …/versions/:id/revisions`, which creates draft N+1 with copied departments, line items
  and document links.
- **Lifecycle commands** are explicit: `submit` (any active user), `lock` (studio_admin), and
  `revisions` (any active user, only from a locked version, only while nothing is open).
  Content edits are collaborative and draft-only; department removal requires an empty
  department; department names are unique per version, case-insensitively (PostgreSQL index).
- **Concurrency boundary.** Line items and departments carry their own `version` so two users
  can edit different lines of the same draft; lifecycle commands use the budget version's
  `version`. Every stale write answers 409 with no side effects.
- **Addressing history.** `GET …/budget` returns the open version (or, if none, the latest
  locked one) as `currentVersion`, `latestLockedVersionId`, and a summary of every version
  with its exact total and lifecycle actors; `GET …/budget/versions/:id` returns any exact
  version. **Finance Plan and Cash Flow must reference a `budget_version_id`, normally the
  locked version they were built from, never "whatever is current".**
- **Documents** attach to a department of a specific version through
  `budget_department_documents` (owner convention, folder `financing/budget`); revisions copy
  the links, so the same lineage is attached to the successor.
- **Audit vocabulary:** `budget.created`, `budget_version.created|submitted|locked`,
  `budget_department.created|updated|deleted|document_attached|document_detached`,
  `budget_line_item.created|updated|deleted` (amount changes record from and to).

## Finance plan

The Finance Plan is the second Finance subdomain: a project's register of funding sources
measured against **one exact locked budget version** (ADR 0011, amended). It is the input the
later Cash Flow module reads for inflows.

- **Provenance.** `finance_plans` (one per project, unique) references
  `budget_versions.id` with `ON DELETE RESTRICT`. Creation and `POST …/finance-plan/budget-version`
  (rebase to another version) both require a version _of the same project_ (404 otherwise) with
  status `locked` (`422 BUDGET_VERSION_NOT_LOCKED`). The API answers `budgetVersionId` and
  `budgetVersionNumber`; the referenced version's exact total is the baseline even while a newer
  draft revision is being edited.
- **One calculation.** `summarizeFinancing` in `shared/contracts/finance-plan.ts` is the only
  place financing totals are computed: per-status totals, `committedTotal` (soft committed plus
  approved), `fundingGap` (budget minus approved, floored at zero) and `overFinancedBy`. It works
  in BigInt cents through the shared money helpers, runs on the server for every response, and
  the client renders the returned strings. Nothing is stored: `finance_plans` and
  `finance_sources` hold no total or gap column, and the integration suite asserts that.
- **Sources** (`finance_sources`): name, type (`finance_source_type`), `amount numeric(14,2)`
  non-negative, status (`targeted`, `soft_committed`, `approved`), optional `expected_date`
  (`date`, exact for cash flow), notes, deterministic `position` (unique per plan), creator,
  approver, `approved_at`, own optimistic `version`. Edits (`PATCH`) are collaborative and never
  carry status. `POST …/status` moves between `targeted` and `soft_committed`.
- **Approval is a sign-off.** `POST …/sources/:id/approve` is studio_admin-only, irreversible,
  records `approved_by_user_id` and `approved_at` (CHECK
  `finance_sources_approval_matches_status` ties both to the status), and freezes the source:
  every later edit, status change, removal or document detach answers
  `409 FINANCE_SOURCE_APPROVED`. Only approved money counts as secured funding. Removal of an
  unapproved source is creator-or-admin. There is no plan-level submit or lock: the plan is a
  living register; the budget version it references is what is locked.
- **Concurrency.** Every source command runs in one transaction, locks the plan row
  (`SELECT … FOR UPDATE`) and compare-and-sets the source's `version`; the rebase command uses the
  plan's `version`. Every command returns the whole plan with its summary so the client never
  adds money.
- **Documents** attach to a source through `finance_source_documents` (owner convention,
  folder `financing/finance-plan`). Attaching to an approved source is allowed (evidence keeps
  arriving); detaching from one is not.
- **Cash-flow readiness.** Cash Flow will read `financePlan.budgetVersionId`, the approved
  sources with their exact amounts and `expectedDate`, and never recompute the gap itself.
- **Audit vocabulary:** `finance_plan.created|rebased`,
  `finance_source.created|updated|status_changed|approved|deleted|document_attached|document_detached`
  (amount changes record from and to; approval records the prior status and amount).

## Cash flow

Cash Flow is the third Finance subdomain and a planning tool, not a ledger. One `cash_flows`
row per project references the finance plan and, through it, the exact locked budget version.

```
Locked Budget Version ──▶ Finance Plan ──▶ Approved Finance Sources ──▶ Cash Flow schedule ──▶ Financing Overview
```

- **What is authored.** Only timing and the starting point: `timeframe` (`monthly` or
  `weekly`, a shared view of the same schedule), `opening_balance` (non-negative), one spend
  window per department (`cash_flow_department_windows`, FK to the exact
  `budget_departments` row, `end_date >= start_date`), dated one-off payments or receipts
  against a department (`cash_flow_payments`, amount `> 0`, `direction`), and a per-source
  expected-date override (`cash_flow_source_timings`, FK to `finance_sources`). Nothing else
  is stored: no period totals, no balances.
- **What is derived.** Departments and their exact totals come from the plan's referenced
  version; inflows are the plan's approved sources with their immutable amounts and the
  plan's `expectedDate` unless a timing override exists. `projectCashFlow` in
  `shared/contracts/cash-flow.ts` is the only calculation: BigInt cents, `YYYY-MM-DD` dates
  as UTC day numbers, monthly periods keyed `YYYY-MM` or Monday-start weeks keyed by their
  date, a range from the earliest dated entry (or today) to three months past the latest, a
  department total spread evenly by day with floor-of-cumulative allocation so the periods sum
  to the total exactly, inflow, outflow, net and closing balance per period (balances may be
  negative), the low point, the first shortfall, per-department scheduled outflow, and the
  unscheduled inflow and outflow (approved money without a date, departments without a
  window). The server runs it on every read; the client renders the strings and converts to
  `Number` only for chart geometry.
- **Provenance rules.** Creating a cash flow needs the finance plan
  (`422 FINANCE_PLAN_REQUIRED`); a window or payment may reference only a department of the
  version the plan references (`422 DEPARTMENT_NOT_IN_REFERENCED_VERSION`, 404 outside the
  project); a timing override only an approved source of the plan
  (`422 FINANCE_SOURCE_NOT_APPROVED`). After a rebase, rows that reference departments of the
  previous version stay in the table for provenance and are not part of the schedule. Edits to
  a draft budget revision never reach the schedule.
- **No allocation caps.** The product spreads a department's whole total across its window and
  treats payments as additional movements; there is no rule that allocations must equal or
  may not exceed the budget, so none is enforced.
- **Authorization and concurrency.** Any active user creates and edits the schedule
  (collaborative); removing a payment is creator-or-admin. Windows, payments and timings carry
  their own `version` (`version: 0` creates a window or timing; the current version replaces
  it); opening balance and timeframe use the cash flow's `version`. Each command runs in one
  transaction that takes the cash flow's row lock so upserts serialise; a stale write is
  `409 VERSION_CONFLICT` with no side effects.
- **Audit vocabulary:** `cash_flow.created|updated`,
  `cash_flow_department_window.set|cleared`, `cash_flow_payment.created|updated|deleted`,
  `cash_flow_source_timing.set|cleared` (from/to values where they change).

## Financing overview

`GET /projects/:id/financing-overview` is a read model with no table and no writes:
`createFinancingOverviewService` composes the Budget, Finance Plan and Cash Flow services at
request time. It returns the latest locked budget version and its exact total (plus whether a
revision is open), the plan's `summarizeFinancing` result with its sources, and the cash flow's
`projectCashFlow` totals (opening, inflow, outflow, closing, low point, first shortfall,
unscheduled amounts). Each section is `null` where that domain has nothing yet, so the client
shows real empty states rather than placeholder figures. Development readiness reads the same
overview: budget locked, funding gap, first shortfall. Copy this shape for any future
dashboard: compose services, never persist copied totals.


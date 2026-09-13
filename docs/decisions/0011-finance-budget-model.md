# ADR 0011: Finance money conventions and the budget version model

Date: 2026-09-13. Status: accepted.

## Context

The prototype budget summed JavaScript numbers, invented an approver, kept history as
copied UI snapshots and stored a currency per version. Finance Plan and Cash Flow will be
built on the Budget, so its money, versioning and locking rules must be settled first and
must hold for the later modules.

## Decision

1. **Money is exact everywhere.** PostgreSQL `numeric(14,2)`; decimal strings on the API;
   `shared/contracts/money.ts` (validation, BigInt-cents arithmetic, formatting) in both
   client and server. No monetary value passes through floating point. Totals are derived by
   PostgreSQL from line items and never stored; a stored total would be a second source of
   truth.
2. **One currency per budget**, chosen at creation and fixed for all versions. Later finance
   modules read it from the budget; FX is out of scope.
3. **Budget and BudgetVersion are distinct.** The budget is the stable project concept; a
   version is a numbered revision owning its departments and line items. At most one version
   is open (draft or awaiting approval), enforced by a partial unique index.
4. **Locked is permanent.** Content commands lock the version row and require `draft`;
   lifecycle steps are explicit commands (`submit`, `lock`, `revisions`) with actors and
   timestamps stored on the version and mirrored in audit events. A revision copies a locked
   version into a new draft; nothing ever mutates a locked version.
5. **Approval is administrative.** Any active user drafts, edits and submits; only a
   studio_admin approves and locks.
6. **Later finance work references an exact `budget_version_id`.** A finance plan or a cash
   flow projection states which locked budget version it derives from, so its numbers stay
   reproducible when a revision is opened.
7. **No generic finance framework.** No ledger, double-entry, approval engine or currency
   conversion; each later subdomain gets its own explicit model that follows these rules.

## Consequences

- Finance Plan and Cash Flow copy the same shapes: `numeric(14,2)`, decimal strings, derived
  totals, explicit lifecycle commands, and a foreign key to the budget version they use.
- Historical budgets are queryable forever with exact totals and the people who locked them.
- Concurrency is per line item and per department for edits, per version for lifecycle.

**Amendment (Finance Plan milestone, 2026-09-13).** The Finance Plan applies rule 6 as a hard
server invariant: a plan (one per project) is created against, and may later be re-pointed to,
a _locked_ budget version of the same project only; an unlocked version is refused with
`422 BUDGET_VERSION_NOT_LOCKED` because an editable budget cannot be a financial baseline.
Financing totals and the funding gap are never stored; `summarizeFinancing` in
`shared/contracts/finance-plan.ts` is the single calculation, executed on the server for every
response. Sources do not copy the budget's submit/lock lifecycle: they have three statuses
(`targeted`, `soft_committed`, `approved`); approval is a studio_admin sign-off that is
irreversible and freezes the source, and only approved money counts as secured. Approval is
per source, not per plan, so a plan stays a living register while its baseline is fixed.

**Amendment (Cash Flow + Financing Overview milestone, 2026-09-13).** Cash Flow completes the
chain: it references the finance plan and therefore the plan's exact locked budget version, its
inflows are the plan's approved sources with their immutable amounts, and it stores only
authored timing (department spend windows, dated one-off payments, per-source expected-date
overrides), the timeframe and the opening balance. Every period total and balance is
`projectCashFlow` in `shared/contracts/cash-flow.ts`, computed on the server for each read
with BigInt cents and UTC day numbers; nothing derived is persisted, and there is no separate
cash-flow version or snapshot because its inputs are already immutable. The Financing Overview
is a read model composed from the three services with no table. Two policies are recorded:
re-pointing a finance plan at another locked budget version (`rebase`) is studio_admin-only,
because it changes the baseline of the plan and the cash flow, the same class of decision as
locking a budget; and cash-flow editing is collaborative with creator-or-admin removal of
payments, matching budget line items.

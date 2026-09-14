# Frontend state

```
SERVER STATE            React Query, one feature module per domain
UNSAVED / TRANSIENT     local React state in the component or form
GLOBAL CLIENT STORE     none; there is no prototype database on the client
```

## Feature modules

`client/src/features/<domain>/` owns:

- `<domain>-api.ts`: typed functions over `apiClient(method, path, responseSchema, body)`.
  Responses are parsed with the shared Zod contract; there is no raw `fetch` in components
  (the PDF reader's byte stream is the one deliberate exception).
- `use-<domain>.ts`: the root query key (`["<domain>", projectId]`), `useQuery` hooks that
  always supply their own `queryFn`, and mutations built on `useVaultMutation`.
- `labels.ts`: display labels for contract enums.

The query client has no default `queryFn`, infinite `staleTime`, no refetch on focus and no
retries: data changes only through mutations and explicit invalidation.

## Mutations

`useVaultMutation` (`client/src/lib/mutations.ts`) is the one pattern: invalidate the
affected query keys on success, refetch them when the server answers 409, one toast per
outcome. Components that must react (keep a dialog open, navigate) await `mutateAsync` and
catch; they never add their own toasts. Commands that return the whole aggregate write it into
the cache immediately (`setQueryData`) so the next edit carries a fresh `version`.

Commit-on-blur fields use `CommitInput` (`client/src/components/forms/CommitInput.tsx`) or
`MoneyInput`: the draft is local, resets only when that field's server value changes, and
**resets to the authoritative value when its own commit is rejected**. Per-record commit
queues (`useCommitLineItem`, `useCommitFinanceSource`) and send-time hooks
(`useCommitDepartmentName`, `useCommitCashFlowSettings`) read the record's latest `version`
from the cache when the request is sent, so a render-time version never produces a false
conflict. Real conflicts between two users still answer 409 and reconcile to the server.

## Errors are not empty states

A surface renders its business content only after every query it depends on has succeeded.
`QueryState` (`client/src/components/QueryState.tsx`) renders loading and error text first;
lists use `isSuccess` before showing "nothing here yet". An outage must never read as an
empty project, zero legal completion, or a non-admin user.

## Documents embedded in owners

Six domains embed `Document` contracts (people, rights, legal records, scripts, budget
departments, finance sources, distribution territories). Every document mutation invalidates
the library **and** every owner family listed in
`client/src/features/documents/document-owner-keys.ts`; a unit test pins that list to each
feature's root key. When a new domain embeds documents, add its key there.

## Project identity

`ProjectWorkspaceProvider` loads the project once; `useProjectWorkspace()` gives every
workspace view the one contract `Project` plus the caller's admin flag. `useIsStudioAdmin()`
is UX gating only and is valid behind `ProtectedRoute`, which renders nothing until the
session resolves and leaves for sign-in when it cannot.

## Unfinished areas are honest

Production scheduling and call sheets are not part of this release. The Production stage
page and the Schedules category say so and offer only what is real (tasks, document
folders). Never simulate business state on the client.

# Authentication and authorization

## Authentication

The Vault is closed: nobody signs up, and there is no third-party identity provider. Accounts
come from the operator bootstrap and from studio administrators. Everything below lives in
`server/modules/auth` and is exercised end to end by the integration and browser tests.
Do not add an external identity provider, MFA or password reset in passing; the extension
point is documented and deliberately empty (ADR 0007).

### Tables

| Table | Holds | Never holds |
| --- | --- | --- |
| `application_users` | id, email (unique, case-insensitive), display name, role, status, version | credentials, sessions |
| `user_credentials` | one row per user: self-describing password hash, `password_changed_at` | plain text |
| `auth_sessions` | SHA-256 of the session token, user, created/expires/last-seen/revoked | the token itself |

Both child tables reference `application_users` with `ON DELETE CASCADE`; a user's credential
and sessions have no meaning without the user.

### Passwords

scrypt from Node's crypto module: `N=2^16, r=8, p=2`, 16-byte random salt, 32-byte key,
64 MiB per hash, input normalised to NFKC. Stored as `scrypt$N$r$p$salt$hash`. Because the
parameters travel with the hash, `needsRehash` can raise them and the next successful login
rehashes. Minimum length 12 (`passwordSchema` in shared contracts). Chosen over Argon2id for
zero native dependencies and identical behaviour on every host; an Argon2id implementation
would add a new prefix and reuse the same verify path.

### Sessions and cookie

Login generates 32 random bytes (base64url) and stores only their SHA-256. The browser holds the
token in `vault_session`: `HttpOnly; SameSite=Lax; Path=/; Max-Age=7 days`, plus `Secure` in
production. Absolute lifetime 7 days, idle timeout 24 hours, `last_seen_at` written at most
every 5 minutes. Login retires whatever session the browser was carrying (rotation), logout
revokes, suspension revokes every live session of the user. Nothing is stored in browser
storage; the client only asks `/auth/me`.

### Request lifecycle

```
POST /auth/login   loginSchema → findByEmail → verify hash (dummy hash when unknown, so timing
                   matches) → refuse suspended (403) → rotate + insert session + audit → cookie
any /api request   cookie → hash → session live? (not revoked, not expired, not idle)
                   → user still active? → req.localUser   else 401 (or 403 ACCOUNT_SUSPENDED)
POST /auth/logout  revoke + audit, clear cookie (idempotent)
GET  /auth/me      the safe LocalUser contract
```

Wrong password and unknown email produce the same response and the same cost. Login failures
are logged with the request ID only. Login is rate limited per client IP on failed attempts.

### CSRF and origin

The `SameSite=Lax` cookie plus `mutationOriginGuard` on every `POST/PUT/PATCH/DELETE`: a
`Sec-Fetch-Site: cross-site` request is refused; an `Origin` that is not one of this
deployment's hosts (HTTPS in production) is refused; in production a missing `Origin` is
refused. In development a missing `Origin` is tolerated so command-line clients and Supertest
work, while a wrong origin is still refused.

### Roles and access

Roles are `studio_admin` and `user`, nothing finer. `requireLocalUser` resolves the session on
every request; `requireStudioAdmin` guards administrative and lifecycle commands. Nothing on the
client is a security boundary: `useIsStudioAdmin()` only hides navigation and actions.

### Accounts

- **Bootstrap** (`npm run bootstrap:admin`): explicit operator command, never an HTTP route,
  reading `VAULT_BOOTSTRAP_ADMIN_EMAIL/PASSWORD/NAME`. Creates the first active studio_admin,
  its credential and the audit event in one transaction. Idempotent; refuses to modify an
  existing Vault user.
- **Provisioning** (`POST /api/v1/users`): a studio_admin supplies name, email, initial password
  and role. The service hashes the password, then inserts user, credential and audit event in
  one transaction. Duplicate emails are refused (case-insensitive).
- **Commands**: change role, suspend (revokes sessions), reinstate. Each is versioned and
  audited. A user cannot demote or suspend themself; the last active studio_admin cannot be
  demoted or suspended.

### Extension point

Email one-time-code MFA and password reset sit between "verify hash" and "issue session" in
`auth-service.ts`: a pending-challenge record, an email sender, and a completing endpoint that
calls the same session issuance. The user, credential and session tables do not change. Not
built; documented so it is built in the right place.

## Authorship and roles

Every durable record carries `created_by_user_id`. Ordinary users manage their own authored
records where a domain permits; studio_admin manages everything; lifecycle and administrative
commands are studio_admin-only unless a domain records a different decision. Services resolve
actors for display. See ADR 0006.

### The studio-wide visibility model

One Vault deployment serves one production company. Every active user belongs to that studio,
so **every active user can read every project and every record in it**, and can take part in
every collaborative command (notes, tasks, people, rights, legal records, documents, scripts,
budget drafts, finance plans, cash flow, territories). There is no project membership, no
per-project ACL and no tenant concept; a second company gets its own deployment, database and
storage. The only narrower rules are the ones each domain states explicitly: authored-record
ownership (author or creator or uploader, else studio_admin) for edits that belong to one
person and for destructive commands, and studio_admin for lifecycle sign-offs (project stage
and archive, user administration, budget lock, financing approval and rebase, audit reads).
Deliberate asymmetries that look accidental are not:

- A **draft budget** is a shared worksheet: departments, line items and their document links
  are created, edited, removed and detached by any active user, because nothing in a draft is
  anyone's authored record; the lock is the sign-off and locked content is immutable. Starting
  a revision from a locked version is likewise open to any user: it creates a new draft and
  never touches the locked version the finance plan and cash flow reference.
- **Cash-flow payments** are authored rows (creator-or-admin to remove); **spend windows and
  timing overrides** are settings on a department or source with no author, so clearing them
  is collaborative like setting them.
- **Documents** belong to their uploader: metadata edits, adding a version and deletion are
  uploader-or-admin on the current version, whichever route reaches the Documents primitive
  (Scripts included).

Where an admin-only rule is enforced: `requireStudioAdmin` middleware guards a route when the
whole endpoint is administrative (projects lifecycle, users, evaluation profile, audit);
an in-service `assertCan*` guards a command when it is one admin-only step among collaborative
commands on the same aggregate and needs the loaded record (budget lock, financing approve and
rebase). Both are server-side; the client only hides controls.

## Authored records, actors and assignment

Project Notes, Project Tasks and team Reviews are the reference implementations of an
**authored record**: a row any active user may create, owned by its author, listed for the
whole team. Mirror these rules when a new domain has the same shape.

- **Authorship comes from the session.** The service takes `actor.userId` from
  `req.localUser`; a request body never names an author. The column is `author_user_id`
  (`created_by_user_id` on tasks, where assignment is a separate concept), `NOT NULL`, a
  foreign key to `application_users` with `ON DELETE RESTRICT`.
- **Author-or-admin policy** lives in one `assertCanManage(actor, record)` per service:
  studio_admin may do anything; otherwise the caller must be the author. A refusal is 403
  before any write. Collaborative commands are explicit exceptions the service documents:
  any user may complete, reopen or reassign a task; only the creator or an admin edits its text
  or deletes it.
- **Actor representation** on the wire is `UserRef = { id, displayName }` from
  `shared/contracts` (`userRefSchema`), built by `toUserRef` in `server/modules/users/user-ref.ts`.
  Repositories join `application_users` and select only `id`, `displayName`, `email`
  (the email is the display-name fallback and never leaves the server unless a contract says so,
  as `auditActorSchema` does for admins). Never store display names on records.
- **Assignment is a foreign key**, not a string: `project_tasks.assignee_user_id` references
  `application_users` (nullable, `ON DELETE RESTRICT`). The service verifies the target is an
  active user (`422 ASSIGNEE_NOT_ASSIGNABLE`) and the picker reads `GET /users/directory`,
  the one user endpoint every signed-in user may call; it returns `UserRef`s only.
- **One review per author per project** is a PostgreSQL unique index on
  `(project_id, author_user_id)`. The API exposes it as `PUT /projects/:id/reviews/mine`:
  `version: 0` creates, the current version replaces, and the recommendation is derived on the
  server (`review-recommendation.ts`) so every stored verdict follows the same rule.
- **Lifecycle commands, not status fields.** Task status changes only through
  `POST …/tasks/:id/complete` and `…/reopen`; the task update schema has no `status`, so a
  PATCH cannot change it (the key is stripped; a body with nothing else is `400`). The
  `completed_at`/`status` pair is a CHECK constraint. Each command appends its own audit event
  (`task.completed`, `task.reopened`) with the actor who ran it.
- **Deletion.** Notes and tasks are soft-deleted (`deleted_at`) so audit trails keep their
  subject; reviews are hard-deleted because a withdrawn opinion should not linger. Both require
  the current `version` and emit `<domain>.deleted`.
- **The evaluation profile** is a 1:1 aggregate (`project_evaluations`, primary key
  `project_id`) with its four development gates as typed boolean columns. It is project-level
  metadata, so `PUT /projects/:id/evaluation` is studio_admin only; `version: 0` creates. Reads
  for a project with no row return an empty version-0 profile so the client has one shape.
- **Ordering** is deterministic: `created_at` then `id`, newest first for feeds.
- **Audit vocabulary:** `evaluation.created|updated`, `review.submitted|updated|deleted`,
  `note.created|updated|deleted`, `task.created|updated|completed|reopened|deleted`. One event
  per successful command, inside the command's transaction, never on failure.

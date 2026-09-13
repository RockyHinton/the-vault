> **Partly superseded by ADR 0007.** The closed-access, administrator-provisioned model stands; the Clerk identity provider described below has been replaced by first-party password and session authentication. Kept for history; do not reintroduce Clerk.

# ADR 0005: Closed access, administrator-provisioned accounts

## Decision

The Vault is a closed application. Nobody can sign up. Accounts exist only because a studio
administrator created them or because an operator ran the one-time bootstrap.

Clerk remains the identity provider: it stores credentials, verifies passwords, issues and
verifies sessions, and enforces password strength and breach checks. The Vault never stores,
hashes, logs or echoes a password. The Vault owns onboarding, access and roles through
`application_users`; signing in with Clerk grants nothing until a matching active row exists.

Provisioning goes through the server: a studio_admin submits name, email, initial password and
role; the server creates the Clerk identity through the backend API (email verified on creation,
so no email delivery is required), then inserts the access row and the audit event in one
transaction. The first studio_admin is created by `npm run bootstrap:admin`, an explicit
operator command that reads its inputs from the environment, adopts an existing identity for the
email if one exists, creates one otherwise, and refuses to modify any existing Vault user.

Clerk is reached only through `server/modules/auth/identity-provider.ts`. Tests use an
in-memory implementation of the same interface and never contact Clerk.

## Rationale

A production company's Vault holds private commercial material. Public registration, even with
email verification, turns access control into an approval queue and a source of stray identities.
Administrator provisioning matches how these companies actually onboard staff, removes the need
for the Vault to send email, and keeps the "who has access" question answerable from one table.

## Consequences

- The `/sign-up` route and Clerk's sign-up link are removed; the Clerk instance should also be
  set to restricted sign-up so its hosted pages agree with the application.
- Administrators must hand initial passwords to people directly; Clerk's own password reset
  flow covers later changes.
- Self-demotion, self-suspension and suspending or demoting the last active studio_admin are
  refused so a deployment cannot lock itself out.
- The earlier request-time bootstrap by Clerk user ID is gone.

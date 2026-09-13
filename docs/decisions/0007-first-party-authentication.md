# ADR 0007: First-party password and session authentication

Supersedes ADR 0002 (Clerk identity) and the Clerk-specific parts of ADR 0005.

## Decision

The Vault authenticates users itself. There is no external identity provider, no proxy to a
hosted auth service, no social login, no public sign-up and no email verification. Accounts are
created only by the operator bootstrap command and by studio administrators; users sign in with
email and password; the server issues an opaque, server-side session carried in an `HttpOnly`
cookie.

## Why this fits the Vault

Each production company gets a dedicated deployment with its own database, its own users and
its own operator. Its user population is small, known and administrator-managed. An external
identity platform added a second dashboard, a per-instance proxy topology, device-verification
emails and a dependency that local development could not run without network access, while
contributing nothing the closed model needs. Owning authentication keeps the whole lifecycle in
one module, one schema and one set of tests, and makes every deployment identical: PostgreSQL,
the Vault process, HTTPS from the host.

## Security model

- **Identity and credentials are separate.** `application_users` holds identity, role, status
  and version; `user_credentials` holds only a password hash; `auth_sessions` holds only session
  metadata and a hash of the session token. Nothing about sessions lives on the user row.
- **Passwords** are hashed with scrypt from Node's crypto module, parameters `N=2^16, r=8, p=2`,
  16-byte random salt, 32-byte key, 64 MiB memory per hash. The stored string is
  self-describing (`scrypt$N$r$p$salt$hash`), so parameters can be raised, or Argon2id adopted
  under a new prefix, and credentials rehashed on the next successful login with no schema
  change. Passwords are at least 12 characters. scrypt was chosen over Argon2id because Node
  ships it natively: identical behaviour locally and on Replit with no native build dependency.
- **Sessions** are 32 random bytes, base64url, sent only in the `vault_session` cookie. The
  database stores the SHA-256 of the token, so a database read cannot yield a usable session.
  Absolute lifetime 7 days, idle timeout 24 hours (`last_seen_at` written at most every five
  minutes), explicit revocation on logout, and revocation of every live session when a user is
  suspended. A successful login retires whatever session the browser was carrying (rotation).
  Every request re-resolves the session and the user's current status, so suspension is
  effective immediately.
- **Cookie policy**: `HttpOnly; SameSite=Lax; Path=/; Max-Age=<lifetime>`, plus `Secure` in
  production. Local development runs over plain HTTP on localhost and omits `Secure`.
- **CSRF**: the `SameSite=Lax` cookie plus the origin guard on every mutating request. The
  guard rejects `Sec-Fetch-Site: cross-site`, rejects any `Origin` that is not this deployment
  (HTTPS only in production), and in production requires the `Origin` header to be present.
- **Login failures** are indistinguishable for unknown email and wrong password (same code,
  same message, and the unknown-email path verifies against a real dummy hash so timing matches).
  A correct password for a suspended account is refused with `ACCOUNT_SUSPENDED`; the caller
  has proven possession of the credential, so this is not an enumeration channel. Login is rate
  limited per client IP. Failures are logged with the request ID only.
- **No tokens in browser storage**; the client only ever reads `/auth/me`.

## Extension point (documented, not built)

Email one-time-code MFA and password reset fit between "password verified" and "session
issued" in `auth-service.ts`: a pending-challenge record keyed by user, an email sender, and a
second endpoint that completes the challenge and then calls the same session issuance. The user,
credential and session tables do not change.

## Consequences

- Operators own password policy and reset: until password reset ships, an administrator
  provisions a replacement password by hand. This is acceptable for the current user population
  and is the next authentication feature to build.
- Rate limits and sessions are per process; a multi-instance deployment shares sessions through
  PostgreSQL already, and would need a shared store only for rate limiting.
- The Vault carries the responsibility for credential storage. The hashing and session code is
  small, tested and isolated so that responsibility is auditable.

> **Superseded by ADR 0007.** The Vault no longer uses Clerk or any external identity provider. Kept for history only; do not reintroduce.

# ADR 0002: Clerk identity with local application access

## Decision

Use Replit-managed Clerk as the identity provider and `application_users` as the authorization
source of truth. Browser auth uses Clerk cookies, not bearer tokens.

## Consequences

Signing in does not grant Vault access. A local active account is required. The initial operator is
bootstrapped only by an exact configured Clerk ID; no public automatic access path exists.
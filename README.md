# The Vault

The Vault is a dedicated-instance film production management platform. This repository is the
canonical modular monolith for one client deployment at a time.

## Start here

- [Architecture](ARCHITECTURE.md) explains module boundaries, the authentication lifecycle and
  the required dependency direction.
- [Development](DEVELOPMENT.md) explains local setup, the first-admin bootstrap, migrations,
  safety controls, and checks.
- [ADRs](docs/decisions) record the foundation decisions.

Authentication is first-party and closed: no sign-up, no external identity provider. Accounts
are created by the operator bootstrap and by studio administrators. Persisted domains so far:
**Projects** and **Users & Access**. Other workspace screens intentionally retain temporary
prototype fixtures behind a frontend adapter while their domains are migrated individually.

# The Vault

The Vault is a dedicated-instance film production management platform. This repository is the
canonical modular monolith for one client deployment at a time.

## Start here

- [Architecture](ARCHITECTURE.md) explains module boundaries and required dependency direction.
- [Development](DEVELOPMENT.md) explains local setup, migrations, safety controls, and checks.
- [ADRs](docs/decisions) record the foundation decisions.

The first persisted domain is **Projects**. Other workspace screens intentionally retain temporary
prototype fixtures behind a frontend adapter while their domains are migrated individually.
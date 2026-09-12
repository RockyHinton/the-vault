# ADR 0001: Use a modular monolith

## Decision

Keep React, Express and PostgreSQL in one deployable repository with explicit domain modules.

## Rationale

The product needs many connected production workflows but currently has one dedicated-instance
deployment. A modular monolith preserves simple operations while enforcing boundaries that can
support long-term growth.
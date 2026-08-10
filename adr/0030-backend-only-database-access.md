# ADR 0030: Backend-only database access

**Status:** Accepted

## Context

ADR 0029 closed the direct-PostgREST exposure with Row Level Security, but
RLS is Defense-in-Depth — a second barrier, not the rule itself. The
underlying architectural rule predates that fix (true since Phase 1) and
needs to be stated on its own, independent of any particular database or
security mechanism, so it isn't mistaken for something RLS introduced.

## Decision

**Business tables are never accessed directly by frontend applications.
Every business operation must always pass through the ERP REST API.**

This rule is permanent and mechanism-independent. It remains valid
regardless of what other clients Cleopatra ERP grows to serve — a future
Customer Portal, Mobile Apps, a public Website, AI agents, or third-party
integrations all reach business data exactly the same way every existing
client does today: through the REST API, subject to its authentication,
RBAC (ADR 0021/0022), and audit logging in full. None of them get a direct
database connection, a service-role key, or an RLS policy scoped to let
them read tables themselves, no matter how convenient that might seem for
a specific feature.

## Consequences

- A new client type is an API consumer, never a new database access path
  — onboarding one is an authentication/authorization question ("how does
  this client prove who it is to the API"), not a schema or RLS question.
- RLS policies (ADR 0029) never need to grow more permissive to
  accommodate a new client — the deny-all posture for `anon`/`authenticated`
  holds regardless of how many kinds of clients the API itself serves.
- Any future proposal to let a client query Postgres directly — for
  latency, convenience, or "it's just read-only" — is a violation of this
  ADR, not a case-by-case judgment call.

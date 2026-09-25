# Enterprise Trust Agent — Cybersecurity + Compliance/Audit/Governance/RFP

V2 scaffold for the Anvita platform. See `TECHNICAL_SPEC.md` for the full
architecture, data model, and workflow design — this README is setup/run
instructions only.

## What this is

A working skeleton of two new agents — **Cybersecurity Agent** and
**Compliance / Audit / Governance / RFP Agent** — built on the same shared
spine (Connectors → Enterprise Context/Evidence Graph → Reasoning →
Orchestration → Action → Policy → Audit Trail) described in the Oodles V2
concept doc, and wired to match the existing Anvita stack: Supabase
(Postgres + pgvector + Edge Functions/Deno) on the backend, and the existing
Slack/MS Teams unified command router on the bot layer.

This repo started with zero commits — it is **not** the live Anvita
codebase. It's meant to be reviewed here and then merged into the real
platform repo (schema applied as a migration, Edge Functions deployed
alongside the existing ones, bot commands registered with the real router).

## Layout

```
TECHNICAL_SPEC.md                 architecture, data model, workflows, rollout plan
supabase/migrations/              schema (evidence graph, findings, remediation,
                                   compliance requests/questions, connectors, approvals)
supabase/functions/
  _shared/types.ts                shared TS types matching the schema
  _shared/connectors/base.ts      ConnectorAdapter interface + registry
  _shared/connectors/*.ts         AWS Security Hub, GitHub Advanced Security,
                                   generic SIEM webhook — stubbed, see below
  _shared/audit.ts                audit log writer (new event types only)
  _shared/approvals.ts            generalized approve/reject-with-lock workflow,
                                   lifted from the existing Access Provisioning Agent
  cybersecurity-agent/            detect / investigate / remediate / monitor / report
  compliance-agent/                ingest / retrieve / verify / generate / attach & flag
  evidence-graph/                 evidence node/edge CRUD + semantic search + graph walk
bot/
  router-types.ts                 minimal contract assumed of the existing bot router
  commands/cyber.ts               /cyber scan|findings|investigate|remediate|report
  commands/compliance.ts          /compliance answer|rfp upload|status, /audit evidence
  register.ts                     single entrypoint to wire both command sets in
```

## What's real vs. stubbed right now

Real: schema + RLS, connector interface contract, both agents' full
workflow logic, the generalized approval-lock mechanism, audit logging,
evidence-graph traversal, Slack/Teams command parsing and replies.

Stubbed (marked `TODO(connector)` / `TODO(reasoning)` / `TODO(bot)` in the
code): outbound calls to AWS/GitHub/SIEM/etc., real embedding generation
and LLM-drafted answers via the AI Gateway, and pulling uploaded files out
of the real Slack/Teams event payload. Each stub returns realistic shaped
data so every pipeline (`scan → investigate → remediate` and
`ingest → answer`) runs end-to-end today against mock signals.

## Running locally

Requires the Supabase CLI and a local Supabase stack (matches the existing
platform's dev setup):

```bash
supabase start
supabase db push          # applies supabase/migrations/*
supabase functions serve cybersecurity-agent
supabase functions serve compliance-agent
supabase functions serve evidence-graph
```

Required env vars for the functions (set via `supabase secrets set` or
`.env` for local `functions serve`):

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The schema assumes an existing `organizations` and `profiles` table from
the base platform — before running `supabase db push` against a real
project, confirm those table/column names match (see the comment at the
top of `supabase/migrations/0001_enterprise_trust_agent_schema.sql`) and
replace the `current_org_id()` RLS helper with whatever the live schema
already uses.

## Exercising the pipeline without real credentials

```bash
curl -X POST http://localhost:54321/functions/v1/cybersecurity-agent \
  -H 'content-type: application/json' \
  -d '{"action":"scan","organizationId":"<org-uuid>","actorId":null,"params":{"scope":"all"}}'
```

This runs against the mock connector data in
`supabase/functions/_shared/connectors/*.ts` and persists real
`security_findings` rows — useful for testing the full detect → investigate
→ remediate → approval flow before any vendor API key exists.

## Next steps to go live

See `TECHNICAL_SPEC.md` §9 for exactly what's needed from you (repo
placement, Supabase project access, Slack/Teams app credentials, per-
connector API credentials, and confirmation of which vuln
scanner/EDR/SIEM you actually run).

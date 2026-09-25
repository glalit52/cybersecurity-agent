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
TECHNICAL_SPEC.md                 architecture, data model, workflows, playbook catalog, rollout plan
supabase/migrations/              schema (evidence graph, findings, remediation,
                                   compliance requests/questions, connectors, approvals,
                                   playbook run history + scheduling)
supabase/functions/
  _shared/db.ts                   shared Supabase client factory
  _shared/types.ts                shared TS types matching the schema
  _shared/frameworks.ts           reference control catalog (SOC 2/ISO 27001/NIST CSF) for gap analysis
  _shared/connectors/base.ts      ConnectorAdapter interface + registry
  _shared/connectors/*.ts         AWS Security Hub, GitHub Advanced Security,
                                   Microsoft Sentinel, CrowdStrike Falcon,
                                   Tenable.io, generic SIEM webhook — stubbed,
                                   see below
  _shared/audit.ts                audit log writer (new event types only)
  _shared/approvals.ts            generalized approve/reject-with-lock workflow,
                                   lifted from the existing Access Provisioning Agent
  _shared/ai-gateway.ts           AI Gateway client: embeddings + completions,
                                   throws AiGatewayUnavailableError when unconfigured
                                   so callers can fall back gracefully
  _shared/evidence-graph-core.ts  upsert (auto-embeds), semantic search (keyword
                                   fallback), graph traversal
  _shared/compliance-core.ts      ingest / retrieve / verify / generate / attach & flag core logic
  _shared/playbooks/base.ts       Playbook interface + registry + run-history recording
  _shared/playbooks/cyber/*.ts    8 Cybersecurity playbooks (see TECHNICAL_SPEC.md §4)
  _shared/playbooks/compliance/*.ts  8 Compliance playbooks (see TECHNICAL_SPEC.md §4)
  cybersecurity-agent/            core actions (scan/findings/investigate/remediate/report)
                                   + list-playbooks/run-playbook dispatch
  compliance-agent/               core actions (create-request/answer/status/route-approval)
                                   + list-playbooks/run-playbook dispatch
  evidence-graph/                 evidence node/edge CRUD + semantic search + graph walk
  playbook-scheduler/             pg_cron entrypoint that fans out to due scheduled_playbooks rows
bot/
  router-types.ts                 minimal contract assumed of the existing bot router
  commands/cyber.ts               /cyber scan|findings|investigate|remediate|report|playbooks|run
  commands/compliance.ts          /compliance answer|rfp upload|status|playbooks|run, /audit evidence
  register.ts                     single entrypoint to wire both command sets in
```

## What's real vs. stubbed right now

Real: schema + RLS, connector interface contract, both agents' full
workflow logic, all 16 playbooks' domain logic (severity/criticality
scoring, freshness checks, repeat-offender detection, framework gap
matching, live control testing), the generalized approval-lock mechanism,
audit logging, evidence-graph traversal, playbook run-history recording,
Slack/Teams command parsing and replies, **and the reasoning layer**:
real `text-embedding-3-large` embeddings + pgvector semantic search,
AI-drafted compliance answers with inline citations, AI-drafted
investigation narratives, and AI-confirmed contract clause gaps
(`_shared/ai-gateway.ts`). Every reasoning call falls back to keyword
search / plain evidence listings if no AI Gateway credential is
configured, so the pipeline degrades rather than breaks without one.

Stubbed (marked `TODO(connector)` / `TODO(bot)` in the code): outbound
calls to AWS/GitHub/SIEM/etc., and pulling uploaded files out of the real
Slack/Teams event payload. Each connector stub returns realistic shaped
mock data so every pipeline (`scan → investigate → remediate` and
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
supabase functions serve playbook-scheduler
```

Required env vars for the functions (set via `supabase secrets set` or
`.env` for local `functions serve`):

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# Reasoning layer (optional — falls back to keyword search / plain
# evidence listings if unset, see TECHNICAL_SPEC.md §9):
AI_GATEWAY_API_KEY            # or OPENAI_API_KEY
AI_GATEWAY_URL                # defaults to https://api.openai.com/v1;
                               # point this at the platform's existing AI
                               # Gateway once merged
AI_GATEWAY_CHAT_MODEL         # defaults to "gpt-5"
AI_GATEWAY_EMBEDDING_MODEL    # defaults to "text-embedding-3-large"
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

Or run any of the 16 playbooks directly:

```bash
curl -X POST http://localhost:54321/functions/v1/cybersecurity-agent \
  -H 'content-type: application/json' \
  -d '{"action":"run-playbook","organizationId":"<org-uuid>","actorId":null,"params":{"playbookId":"cloud-misconfiguration-sweep"}}'
```

## Next steps to go live

See `TECHNICAL_SPEC.md` §10 for exactly what's needed from you (repo
placement, Supabase project access, Slack/Teams app credentials, per-
connector API credentials, and confirmation of which vuln
scanner/EDR/SIEM you actually run).

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
deno.json                         lint/fmt/check/test task definitions
.github/workflows/ci.yml          runs all four on every push (see "Testing & CI" below)
supabase/config.toml               Supabase CLI project config — required for `supabase start`/`db push`
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
  _shared/connector-configs.ts    per-org connector enablement — the boundary between
                                   "connector code exists" and "this org turned it on"
  _shared/internal-auth.ts        shared-secret check every function requires (see
                                   "Testing & CI" / TECHNICAL_SPEC.md §7 — without this,
                                   the service-role-backed functions are wide open)
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
  connector-onboarding/           list/enable/disable connectors per org (TECHNICAL_SPEC.md §9)
bot/
  router-types.ts                 minimal contract assumed of the existing bot router;
                                   CommandContext now carries attachments[] for file uploads
  adapters/slack.ts               real Slack Events API + slash-command payload parsing,
                                   file download via files.info + url_private_download
  adapters/teams.ts               real Bot Framework Activity parsing, attachment download
  document-extraction.ts          plain text/CSV extraction (real); PDF/DOCX deferred to the
                                   existing Document Processing Agent's OCR pipeline
  question-extraction.ts          splits extracted text into discrete questions
                                   (numbered lists, bullets, interrogative sentences)
  commands/cyber.ts               /cyber scan|findings|investigate|remediate|report|playbooks|run
  commands/compliance.ts          /compliance answer|rfp upload|status|playbooks|run, /audit evidence
  commands/connectors.ts          /cyber|compliance connectors|connect|disconnect
  internal-fetch.ts               attaches the shared secret to every call into the agent functions
  register.ts                     single entrypoint to wire all command sets in

*.test.ts files sit next to the module they test (question-extraction.test.ts,
document-extraction.test.ts, connectors/base.test.ts, frameworks.test.ts,
playbooks/base.test.ts, internal-auth.test.ts) — standard Deno convention.
```

## What's real vs. stubbed right now

Real: schema + RLS, connector interface contract, **per-org connector
enablement** (a fresh org gets zero findings until it explicitly enables a
connector via `/cyber connect`, not mock data from everything registered),
both agents' full workflow logic, all 16 playbooks' domain logic
(severity/criticality scoring, freshness checks, repeat-offender
detection, framework gap matching, live control testing), the generalized
approval-lock mechanism, audit logging, evidence-graph traversal, playbook
run-history recording, **the reasoning layer** (real
`text-embedding-3-large` embeddings + pgvector semantic search, AI-drafted
compliance answers with inline citations, AI-drafted investigation
narratives, AI-confirmed contract clause gaps — `_shared/ai-gateway.ts`,
falls back to keyword search / plain evidence listings without a
credential rather than breaking), and **real Slack/Teams event parsing**:
actual Events API / Bot Framework Activity payload shapes, file-attachment
download, and RFP question extraction from uploaded text/CSV files
(`bot/adapters/`, `bot/document-extraction.ts`, `bot/question-extraction.ts`).

Stubbed (marked `TODO(connector)` in the code): the actual outbound HTTP
calls to AWS/GitHub/SIEM/etc. once a connector is enabled, and PDF/DOCX
extraction for RFP uploads — deliberately deferred to the existing
Document Processing Agent's OCR pipeline rather than reimplemented here
(plain text/CSV uploads work today, real extraction, no stub). Each
connector stub returns realistic shaped mock data once enabled, so every
pipeline (`scan → investigate → remediate` and `ingest → answer`) still
runs end-to-end today against mock signals.

## Testing & CI

```bash
deno task fmt      # format check
deno task lint      # lint
deno task check     # type-check every function + bot module
deno task test      # run the test suite (bot/*.test.ts, supabase/functions/_shared/**/*.test.ts)
```

**Honesty check on how verified this actually is:** this scaffold was built
in a sandboxed environment where `deno.land`/`jsr.io` are blocked by
outbound network policy, so the Deno CLI itself was never installable
there — every check up to this point was a hand-rolled `tsc --noEmit`
invocation under Node (type-checking only, and only by manually filtering
out Deno-specific import/global errors). That's real but limited: it
already caught nothing wrong with `question-extraction.ts`'s original
logic, because a type checker doesn't know a completed sentence shouldn't
absorb the next line. Actually *running* the pure, dependency-free modules
under Node (`node --experimental-strip-types`) caught a real bug — a
finished question stayed "open" and silently swallowed the next unrelated
line — which is now fixed and covered by
`bot/question-extraction.test.ts`'s regression test.

The `.github/workflows/ci.yml` added here runs the four commands above
against a real Deno CLI on every push — that's the first time this whole
suite will actually execute. Treat the first CI run on this branch as a
real result, not a formality: if something in the DB/Deno-specific 80% of
the codebase (everything importing `db.ts`, `ai-gateway.ts`, the
`Deno.serve` entrypoints) has a bug analogous to the one found by hand
above, this is where it would surface, since none of that code has been
executed anywhere yet — only type-checked.

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
supabase functions serve connector-onboarding
```

Required env vars for the functions (set via `supabase secrets set` or
`.env` for local `functions serve`):

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# REQUIRED on every function (cybersecurity-agent, compliance-agent,
# evidence-graph, connector-onboarding, playbook-scheduler). These
# functions use the service-role client, which bypasses RLS by design —
# without this shared secret, anyone who finds a function's URL could pass
# any organizationId and act on any tenant's data. Every caller (bot
# commands, pg_cron) must send it as the x-internal-api-key header. See
# _shared/internal-auth.ts and TECHNICAL_SPEC.md §7 (RBAC, Policy & Audit
# extensions — "Service-to-service auth boundary").
INTERNAL_API_SECRET

# Reasoning layer (optional — falls back to keyword search / plain
# evidence listings if unset, see TECHNICAL_SPEC.md §10):
AI_GATEWAY_API_KEY            # or OPENAI_API_KEY
AI_GATEWAY_URL                # defaults to https://api.openai.com/v1;
                               # point this at the platform's existing AI
                               # Gateway once merged
AI_GATEWAY_CHAT_MODEL         # defaults to "gpt-5"
AI_GATEWAY_EMBEDDING_MODEL    # defaults to "text-embedding-3-large"

# Bot file-download (optional — only needed for /compliance rfp upload;
# see TECHNICAL_SPEC.md §11 on why this is one shared token for now):
SLACK_BOT_TOKEN
TEAMS_BOT_TOKEN
```

The schema assumes an existing `organizations` and `profiles` table from
the base platform — before running `supabase db push` against a real
project, confirm those table/column names match (see the comment at the
top of `supabase/migrations/0001_enterprise_trust_agent_schema.sql`) and
replace the `current_org_id()` RLS helper with whatever the live schema
already uses.

## Exercising the pipeline without real credentials

Every call below needs the `x-internal-api-key` header (§ above) matching
your `INTERNAL_API_SECRET`, or you'll get a 401. Connectors are also
per-org opt-in (see TECHNICAL_SPEC.md §9), so enable one first:

```bash
curl -X POST http://localhost:54321/functions/v1/connector-onboarding \
  -H 'content-type: application/json' \
  -H 'x-internal-api-key: <INTERNAL_API_SECRET>' \
  -d '{"action":"enable","organizationId":"<org-uuid>","actorId":null,"params":{"connectorId":"aws-security-hub"}}'
```

Then scan:

```bash
curl -X POST http://localhost:54321/functions/v1/cybersecurity-agent \
  -H 'content-type: application/json' \
  -H 'x-internal-api-key: <INTERNAL_API_SECRET>' \
  -d '{"action":"scan","organizationId":"<org-uuid>","actorId":null,"params":{"scope":"all"}}'
```

This runs against the mock connector data in
`supabase/functions/_shared/connectors/*.ts` (no `credentialRef` was set
above, so it returns stub data rather than calling AWS) and persists real
`security_findings` rows — useful for testing the full detect → investigate
→ remediate → approval flow before any vendor API key exists.

Or run any of the 16 playbooks directly:

```bash
curl -X POST http://localhost:54321/functions/v1/cybersecurity-agent \
  -H 'content-type: application/json' \
  -H 'x-internal-api-key: <INTERNAL_API_SECRET>' \
  -d '{"action":"run-playbook","organizationId":"<org-uuid>","actorId":null,"params":{"playbookId":"cloud-misconfiguration-sweep"}}'
```

## Next steps to go live

See `TECHNICAL_SPEC.md` §11 for exactly what's needed from you (repo
placement, Supabase project access, Slack/Teams app credentials, per-
connector API credentials, and confirmation of which vuln
scanner/EDR/SIEM you actually run).

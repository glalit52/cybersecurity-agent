# Enterprise Trust Agent — Technical Spec
### Cybersecurity Agent + Compliance / Audit / Governance / RFP Agent for Anvita AI

Status: Draft v1
Scope: V2 addition to the existing Anvita platform (Oodles). Builds on shipped
infrastructure (Bot Foundation, Access Provisioning Agent, Policy Q&A Agent,
RBAC/Admin panels) rather than standing up a parallel system.

---

## 1. Positioning

Per the "Oodles V2 — Enterprise Trust Agent" concept doc: don't ship two
standalone bots. Ship one **Enterprise Trust Agent** — a shared
Connectors → Enterprise Context/Evidence Graph → Reasoning → Orchestration →
Action → Policy → Audit Trail spine — and expose it as two applications:

- **Cybersecurity Agent**: "Are we secure right now?" — detect, investigate,
  remediate, monitor, report on identity/infra/code/vuln signals.
- **Compliance / Audit / Governance / RFP Agent**: "Can we prove it?" —
  answer security questionnaires, RFPs, SOC 2/ISO evidence requests, and
  vendor/customer due diligence from the same evidence graph.

They share: connectors, the evidence graph, the reasoning/RAG pipeline, the
agent-orchestration router, the approval workflow, RBAC, and the audit log.
They differ only in their action surface (Cyber can execute remediations;
Compliance drafts answers and attaches evidence).

## 2. How this maps onto the existing stack

| Trust-Agent layer | Existing Anvita component it extends |
|---|---|
| Connectors | New Edge Functions beside existing Okta/Azure AD, GitHub, AWS IAM, Jira, Salesforce, Outlook/Gmail connectors |
| Enterprise Context + Evidence Graph | New Postgres tables (`evidence_nodes`/`evidence_edges`) + existing pgvector pipeline |
| Reasoning | Existing RAG Edge Functions (AI Gateway → GPT-5/Gemini, `text-embedding-3-large`, pgvector) — new prompt chain for cross-referencing live signals against evidence |
| Agent Orchestration | Existing "main agent router" from Bot Foundation — register two new agent types |
| Action / Execution | Generalization of the Access Provisioning Agent's approve/reject-with-lock workflow into a reusable `remediation_actions` executor |
| Policy & Permissions | Existing RBAC (Super Admin / Tenant Admin panels) — two new roles: Security Analyst, Compliance Officer/Control Owner |
| Memory | Existing pgvector org memory + new `evidence_nodes` as durable structured memory |
| Audit Trail | Existing immutable audit log (90-day BFSI-compliant retention) — new event types |
| Human Approval | Reuse of the Slack/Teams interactive approve/reject pattern already built for access requests |

No new infra category is introduced — this is Supabase Postgres + Edge
Functions + the existing Slack/Teams bot layer, same as V1.

## 3. Data model (additive — assumes existing `organizations`/`profiles` tables)

See `supabase/migrations/0001_enterprise_trust_agent_schema.sql` for DDL.

- `evidence_nodes` — policies, systems, controls, evidence artifacts, owners,
  contracts, prior RFP answers. Each has a `pgvector` embedding for semantic
  retrieval and a `current_as_of` timestamp so staleness is queryable, not
  just implied.
- `evidence_edges` — typed relationships between nodes (`control→policy`,
  `policy→evidence`, `evidence→system`, `control→owner`, ...). A recursive
  CTE walks this at query time — no separate graph database needed at this
  scale (matches the "no new infra" principle).
- `security_findings` — one row per detection (unusual access, config drift,
  policy violation, vuln, exposed secret, …), with severity/status lifecycle.
- `remediation_actions` — the executable side of a finding; generalized
  version of the existing access-provisioning approval/lock pattern.
- `compliance_requests` / `compliance_questions` — an RFP/questionnaire/audit
  and its line items; each question links to the evidence nodes used to
  answer it, plus a confidence score and a `flagged_gap` boolean.
- `connector_configs` — per-org enable/disable + credential reference (never
  raw secrets — a reference into Supabase Vault / the platform's existing
  secret store) for each connector.
- `approval_requests` — generalized version of the DevOps approve/reject
  table from the Access Provisioning Agent, reused by both new agents.
- `audit_logs` — extended with the new event types (see §6).

## 4. Cybersecurity Agent — workflow

Slash commands (Slack + Teams, routed through the existing unified command
router):

```
/cyber scan <scope>              trigger a connector sweep (identity | infra | code | all)
/cyber findings [--severity=high]
/cyber investigate <finding_id>  agent traces why an account/permission/config exists
/cyber remediate <finding_id>    proposes an action, routes to approval
/cyber report weekly|monthly
```

Pipeline: **Detect → Investigate → Remediate → Monitor → Report**

1. **Detect** — connectors (IAM/Okta/GitHub/AWS Security Hub/SIEM/vuln
   scanner) push or are polled for signals → normalized into
   `security_findings`.
2. **Investigate** — reasoning step pulls the evidence graph node(s) for the
   affected resource (owner, related policy, prior findings) plus live
   connector context, and produces a structured explanation.
3. **Remediate** — for actions inside the org's configured policy (e.g.
   "auto-revoke unused access >90 days" if enabled), execute directly and
   audit-log it. Otherwise create a `remediation_actions` row in
   `pending_approval` and post an interactive Slack/Teams approval card,
   reusing the existing first-to-approve-locks logic.
4. **Monitor** — `pg_cron` scheduled re-checks against configured
   conditions; re-opens a finding if it recurs.
5. **Report** — scheduled posture summary (Slack digest + exportable PDF/CSV
   via the existing Admin Console export pattern).

The differentiator called out in the concept doc — investigate *and*
remediate within defined permissions, not just another dashboard — is the
`remediate` step above; it is the whole reason the approval-lock workflow is
being generalized rather than left one-off in Access Provisioning.

## 5. Compliance / Audit / Governance / RFP Agent — workflow

```
/compliance rfp upload                 ingest an RFP/questionnaire (file or pasted text)
/compliance answer "<question>"        ad-hoc single question
/compliance status <request_id>
/audit evidence <control_id>
```

Pipeline (mirrors the worked example in the concept doc, "Do you encrypt
customer data at rest?"):

1. **Ingest** — parse uploaded RFP/questionnaire into discrete
   `compliance_questions`, or accept a single ad-hoc question.
2. **Retrieve** — semantic + graph search over `evidence_nodes` for the
   relevant policy/control.
3. **Verify** — where the answer references a live system property, call
   the relevant connector to confirm current configuration rather than
   trusting stale evidence (e.g. checking the actual KMS/encryption setting,
   not just the policy document).
4. **Generate** — draft the answer with citations back to the specific
   evidence node(s) used.
5. **Attach & flag** — attach supporting evidence; if evidence is missing,
   contradictory, or older than the control's freshness threshold, set
   `flagged_gap = true` and surface it to the Control Owner instead of
   silently answering.
6. **Route for approval** — before a response leaves the org (customer
   questionnaire, auditor upload), it goes through the same approval-request
   pattern as a remediation action, just with a Compliance Officer as
   approver instead of DevOps.

## 6. RBAC, Policy & Audit extensions

- New roles (Tenant Admin Panel → Roles & Permissions): **Security Analyst**
  (read findings, propose remediation), **Security Admin** (approve/execute
  remediation), **Compliance Officer** (approve outbound answers),
  **Control Owner** (assigned per evidence node; gets escalations on stale
  evidence for their controls).
- Per-org configurable auto-remediation policy (which finding types may
  execute without human approval) — stored alongside existing platform
  settings, enforced in the Edge Function before any `remediation_actions`
  row is allowed to transition to `executed`.
- New audit event types appended to the existing audit log:
  `finding.detected`, `finding.investigated`, `remediation.requested`,
  `remediation.approved`, `remediation.executed`, `compliance.answered`,
  `compliance.flagged_gap`, `evidence.updated`.

## 7. Connectors — V1 additions and priority

Reuse as-is (already built): Slack, MS Teams, Okta/Azure AD, GitHub,
AWS IAM, Jira, Salesforce, Outlook/Gmail.

New, priority order:

| Priority | Connector | Used by |
|---|---|---|
| P1 | AWS Security Hub / Config | Cyber — infra posture |
| P1 | GitHub Advanced Security (secret scanning, Dependabot) | Cyber — code |
| P1 | Generic SIEM webhook ingest (Splunk/Sentinel/Datadog-compatible) | Cyber — detect |
| P1 | Document/evidence store (reuses Supabase Storage + Google Drive/SharePoint via existing Google/Outlook connectors) | Compliance — evidence |
| P2 | Vulnerability scanner (Qualys/Tenable/Snyk — generic interface, pick one for pilot) | Cyber |
| P2 | EDR (CrowdStrike/Defender/SentinelOne) | Cyber |
| P2 | SOC2/ISO evidence platform (Vanta/Drata) if the org already has one, else internal evidence store only | Compliance |
| P3 | Azure Defender / GCP Security Command Center | Cyber (parity for non-AWS orgs) |

All connectors implement one shared interface (`ConnectorAdapter` in
`supabase/functions/_shared/connectors/base.ts`) so adding a new one never
touches agent logic.

## 8. What's actually implemented in this repo vs. stubbed

This repo had zero commits when this work started — it is not the live
Anvita codebase. What's included now:

- Real: schema, connector interface contract, agent orchestration logic
  (detect/investigate/remediate/monitor/report and
  ingest/retrieve/verify/generate/attach/flag), approval-lock logic, audit
  logging, Slack/Teams command router extension, RBAC role definitions.
- Stubbed (clearly marked `TODO(connector)`): the actual outbound HTTP calls
  to AWS/Okta/GitHub/SIEM/etc. Each stub returns realistic shaped mock data
  so the pipeline is exercisable end-to-end today; swapping in a live call
  is a single function body, not a redesign.

## 9. What we need from you to go live

Same shape as your existing client-dependencies list:

- The actual Anvita repo (or confirmation this repo *is* meant to become a
  new service inside that monorepo/org) so schema/agents merge in rather
  than living in parallel.
- Supabase project URL + service role key (or a migration PR path into your
  existing project).
- Slack app + MS Teams app credentials for the bot layer, if different from
  the ones already provisioned for Bot Foundation.
- Per-connector credentials as each is turned on (AWS IAM role/OIDC for
  Security Hub, GitHub App/PAT with security-events scope, SIEM webhook
  secret, etc.) — none of these are needed to review or merge this scaffold.
- Confirmation on which vuln scanner / EDR / SIEM you actually run, so P2
  connectors target the real tool instead of a generic placeholder.

## 10. Suggested milestones (same shape as your existing WBS)

| Milestone | Scope |
|---|---|
| M1 | Schema + connector interface + audit/approval plumbing (this PR) |
| M2 | Cybersecurity Agent: detect + investigate, AWS Security Hub + GitHub Advanced Security connectors, Slack `/cyber` commands |
| M3 | Cybersecurity Agent: remediate + monitor + report, auto-remediation policy config in Tenant Admin |
| M4 | Compliance Agent: ingest + retrieve + generate, evidence graph population tooling |
| M5 | Compliance Agent: verify (live connector cross-check) + approval routing + gap flagging |
| M6 | RBAC roles in Admin panels, posture/compliance dashboards, hardening |

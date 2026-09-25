-- Enterprise Trust Agent schema: Cybersecurity Agent + Compliance/Audit/Governance/RFP Agent
--
-- Additive migration. Assumes the existing Anvita platform already has
-- `organizations` and `profiles` (or equivalent user) tables with RLS
-- helper functions for tenant isolation. Adjust the FK targets and the
-- `current_org_id()` / `has_role()` helper calls below to match the real
-- names in the live schema before applying against production.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Evidence graph
-- ---------------------------------------------------------------------

create type evidence_node_type as enum (
  'policy', 'system', 'control', 'evidence', 'owner', 'contract', 'rfp_response'
);

create table if not exists evidence_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  node_type evidence_node_type not null,
  title text not null,
  content text,
  source_connector text,
  source_ref text,
  embedding vector(3072),
  current_as_of timestamptz,
  freshness_days integer not null default 180,
  owner_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists evidence_nodes_org_idx on evidence_nodes (organization_id);
create index if not exists evidence_nodes_type_idx on evidence_nodes (organization_id, node_type);
create index if not exists evidence_nodes_embedding_idx on evidence_nodes
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create type evidence_relation_type as enum (
  'control_to_policy', 'policy_to_evidence', 'evidence_to_system',
  'control_to_owner', 'control_to_system', 'evidence_to_contract'
);

create table if not exists evidence_edges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  from_node_id uuid not null references evidence_nodes(id) on delete cascade,
  to_node_id uuid not null references evidence_nodes(id) on delete cascade,
  relation_type evidence_relation_type not null,
  created_at timestamptz not null default now(),
  unique (from_node_id, to_node_id, relation_type)
);

create index if not exists evidence_edges_org_idx on evidence_edges (organization_id);
create index if not exists evidence_edges_from_idx on evidence_edges (from_node_id);
create index if not exists evidence_edges_to_idx on evidence_edges (to_node_id);

-- ---------------------------------------------------------------------
-- Cybersecurity Agent: findings + remediation
-- ---------------------------------------------------------------------

create type finding_severity as enum ('low', 'medium', 'high', 'critical');
create type finding_status as enum ('open', 'investigating', 'remediated', 'accepted_risk', 'false_positive');

create table if not exists security_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  connector text not null,
  resource_ref text not null,
  finding_type text not null,
  severity finding_severity not null,
  status finding_status not null default 'open',
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  related_node_ids uuid[] not null default '{}',
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists security_findings_org_idx on security_findings (organization_id, status);
create index if not exists security_findings_severity_idx on security_findings (organization_id, severity);

create type remediation_action_type as enum (
  'revoke_access', 'disable_key', 'rotate_secret', 'open_ticket',
  'notify_owner', 'update_config', 'other'
);

create type remediation_status as enum (
  'proposed', 'pending_approval', 'approved', 'rejected', 'executed', 'failed'
);

create table if not exists remediation_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  finding_id uuid not null references security_findings(id) on delete cascade,
  action_type remediation_action_type not null,
  description text not null,
  status remediation_status not null default 'proposed',
  auto_approved boolean not null default false,
  requested_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  executed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists remediation_actions_org_idx on remediation_actions (organization_id, status);
create index if not exists remediation_actions_finding_idx on remediation_actions (finding_id);

-- ---------------------------------------------------------------------
-- Compliance / Audit / Governance / RFP Agent
-- ---------------------------------------------------------------------

create type compliance_request_type as enum (
  'rfp', 'security_questionnaire', 'soc2_evidence', 'iso_evidence',
  'customer_due_diligence', 'vendor_assessment', 'procurement_questionnaire',
  'internal_audit', 'governance_review'
);

create type compliance_request_status as enum (
  'intake', 'in_progress', 'pending_review', 'completed', 'archived'
);

create table if not exists compliance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  request_type compliance_request_type not null,
  source text,
  title text not null,
  status compliance_request_status not null default 'intake',
  due_date date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists compliance_requests_org_idx on compliance_requests (organization_id, status);

create table if not exists compliance_questions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references compliance_requests(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  question_text text not null,
  answer_text text,
  evidence_node_ids uuid[] not null default '{}',
  confidence numeric(3,2),
  flagged_gap boolean not null default false,
  gap_reason text,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists compliance_questions_request_idx on compliance_questions (request_id);
create index if not exists compliance_questions_org_idx on compliance_questions (organization_id, flagged_gap);

-- ---------------------------------------------------------------------
-- Connectors
-- ---------------------------------------------------------------------

create table if not exists connector_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  connector_type text not null,
  enabled boolean not null default false,
  credential_ref text, -- pointer into Supabase Vault / secret manager, never a raw secret
  config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, connector_type)
);

create index if not exists connector_configs_org_idx on connector_configs (organization_id);

-- ---------------------------------------------------------------------
-- Generalized approval workflow (reused by remediation + compliance answers)
-- ---------------------------------------------------------------------

create type approval_ref_type as enum ('remediation_action', 'compliance_answer');
create type approval_status as enum ('pending', 'locked', 'approved', 'rejected', 'expired');

create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  ref_type approval_ref_type not null,
  ref_id uuid not null,
  requested_by uuid references profiles(id),
  eligible_approver_ids uuid[] not null default '{}',
  status approval_status not null default 'pending',
  locked_by uuid references profiles(id),
  locked_at timestamptz,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  channel_ref text, -- Slack/Teams message ref for the interactive card
  created_at timestamptz not null default now()
);

create index if not exists approval_requests_org_idx on approval_requests (organization_id, status);
create index if not exists approval_requests_ref_idx on approval_requests (ref_type, ref_id);

-- ---------------------------------------------------------------------
-- Audit log event type extension
--
-- Assumes an existing immutable `audit_logs` table (organization_id,
-- actor_id, event_type, target_ref, metadata jsonb, created_at). If the
-- live table uses a free-text event_type column, no migration is needed --
-- the new agents simply start writing these event_type values:
--
--   finding.detected, finding.investigated, remediation.requested,
--   remediation.approved, remediation.rejected, remediation.executed,
--   compliance.answered, compliance.flagged_gap, evidence.updated
--
-- If event_type is instead a constrained enum in the live schema, extend
-- it with the values above via `alter type audit_event_type add value ...`.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Row-Level Security
--
-- Mirrors the existing platform's per-organization isolation. If the live
-- schema already defines a `current_org_id()` helper (or equivalent), the
-- `create or replace` below is a no-op collision to remove before merging.
-- Otherwise this is the standard Supabase JWT-claims pattern and lets the
-- migration apply cleanly on its own for local testing.
-- ---------------------------------------------------------------------

create or replace function current_org_id() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id', '')::uuid;
$$;

alter table evidence_nodes enable row level security;
alter table evidence_edges enable row level security;
alter table security_findings enable row level security;
alter table remediation_actions enable row level security;
alter table compliance_requests enable row level security;
alter table compliance_questions enable row level security;
alter table connector_configs enable row level security;
alter table approval_requests enable row level security;

create policy tenant_isolation_evidence_nodes on evidence_nodes
  using (organization_id = current_org_id());
create policy tenant_isolation_evidence_edges on evidence_edges
  using (organization_id = current_org_id());
create policy tenant_isolation_security_findings on security_findings
  using (organization_id = current_org_id());
create policy tenant_isolation_remediation_actions on remediation_actions
  using (organization_id = current_org_id());
create policy tenant_isolation_compliance_requests on compliance_requests
  using (organization_id = current_org_id());
create policy tenant_isolation_compliance_questions on compliance_questions
  using (organization_id = current_org_id());
create policy tenant_isolation_connector_configs on connector_configs
  using (organization_id = current_org_id());
create policy tenant_isolation_approval_requests on approval_requests
  using (organization_id = current_org_id());

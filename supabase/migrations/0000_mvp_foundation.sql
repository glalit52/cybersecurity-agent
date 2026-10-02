-- MVP foundation: minimal multi-tenant tables the Enterprise Trust Agent
-- schema assumes from the host platform (see the header comment of
-- 0001_enterprise_trust_agent_schema.sql). Fresh Supabase projects don't
-- have them, so they are created here, before 0001's foreign keys.
--
-- Covers every external DB dependency found in this repo:
--   * organizations(id)            — FK target of all *_organization_id columns
--   * profiles(id, organization_id, role)
--       id              — FK target of owner/requested/approved/created/
--                         triggered/locked/resolved actor columns
--       organization_id — read by cybersecurity-agent (eligibleSecurityAdmins),
--                         compliance-core (eligibleComplianceOfficers),
--                         endpoint-threat-containment playbook
--       role            — filtered for 'security_admin' / 'compliance_officer'
--   * audit_logs(organization_id, actor_id, event_type, target_ref,
--     metadata, created_at) — free-text event_type, so no enum extension is
--     needed for the new finding.*/remediation.*/compliance.* event types
--   * current_org_id()   — RLS helper 0001 also defines via CREATE OR REPLACE
--   * vector / pgcrypto  — also ensured in 0001; repeated here so this
--     migration alone leaves a usable base
--
-- actor_id columns are deliberately left without a FK to profiles: callers
-- pass actorId through from the bot layer (often null for scheduled runs),
-- and audit/remediation writes must not fail when the actor isn't a row in
-- profiles yet.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'MVP Organization',
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create index if not exists profiles_org_idx on profiles (organization_id);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  actor_id uuid,
  event_type text not null,
  target_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_idx on audit_logs (organization_id, created_at desc);

create or replace function current_org_id() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id', '')::uuid;
$$;

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table audit_logs enable row level security;

create policy tenant_isolation_organizations on organizations
  using (id = current_org_id());
create policy tenant_isolation_profiles on profiles
  using (organization_id = current_org_id());
create policy tenant_isolation_audit_logs on audit_logs
  using (organization_id = current_org_id());

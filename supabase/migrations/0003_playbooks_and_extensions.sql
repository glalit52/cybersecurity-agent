-- Supports the playbook architecture (supabase/functions/_shared/playbooks/)
-- that expands both agents from 5 fixed actions each into a registry of
-- specialized, independently runnable/schedulable use-case agents.

-- ---------------------------------------------------------------------
-- Playbook run history — observability for every playbook execution,
-- whether triggered manually via Slack/Teams or by the scheduler.
-- ---------------------------------------------------------------------

create type playbook_run_status as enum ('running', 'completed', 'failed');

create table if not exists playbook_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  playbook_id text not null,
  category text not null,
  status playbook_run_status not null default 'running',
  summary text,
  data jsonb not null default '{}'::jsonb,
  findings_created integer not null default 0,
  gaps_flagged integer not null default 0,
  triggered_by uuid references profiles(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists playbook_runs_org_idx on playbook_runs (organization_id, playbook_id);
create index if not exists playbook_runs_started_idx on playbook_runs (organization_id, started_at desc);

alter table playbook_runs enable row level security;
create policy tenant_isolation_playbook_runs on playbook_runs
  using (organization_id = current_org_id());

-- ---------------------------------------------------------------------
-- Scheduled playbook configuration — which playbooks run automatically
-- per org, and how often. Consumed by supabase/functions/playbook-scheduler
-- (invoked by pg_cron, matching the platform's existing pg_cron usage for
-- background jobs).
-- ---------------------------------------------------------------------

create table if not exists scheduled_playbooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  playbook_id text not null,
  enabled boolean not null default true,
  cron_expression text not null default '0 */6 * * *', -- every 6 hours by default
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, playbook_id)
);

create index if not exists scheduled_playbooks_org_idx on scheduled_playbooks (organization_id, enabled);

alter table scheduled_playbooks enable row level security;
create policy tenant_isolation_scheduled_playbooks on scheduled_playbooks
  using (organization_id = current_org_id());

-- ---------------------------------------------------------------------
-- Generalize evidence_nodes with a free-form metadata column so playbooks
-- can attach structured, playbook-specific facts (asset criticality for
-- vulnerability prioritization, framework tags for gap analysis, training
-- completion percentage, etc.) without a new table per use case.
-- ---------------------------------------------------------------------

alter table evidence_nodes add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- Extend remediation_action_type for the new Cybersecurity playbooks
-- (endpoint containment, forcing re-auth on anomalous sessions, email
-- quarantine, access recertification requests). ALTER TYPE ... ADD VALUE
-- must run outside an explicit transaction block in Postgres < 12; the
-- Supabase migration runner applies each statement individually so this
-- is safe as written.
-- ---------------------------------------------------------------------

alter type remediation_action_type add value if not exists 'isolate_endpoint';
alter type remediation_action_type add value if not exists 'force_reauth';
alter type remediation_action_type add value if not exists 'quarantine_email';
alter type remediation_action_type add value if not exists 'request_recertification';

-- Access recertification requests (see the access-recertification-campaign
-- playbook) aren't tied to a specific security_findings row — they're
-- proactive, not reactive to a detection — so finding_id must be optional.
alter table remediation_actions alter column finding_id drop not null;

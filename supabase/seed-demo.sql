-- Demo data for a live (non-demo-mode) dashboard. NOT a migration: run it once
-- by hand (SQL editor) after the migrations, then link a real auth user:
--
--   insert into profiles (id, organization_id, role)
--   values ('<auth.users id>', 'aaaaaaaa-0000-0000-0000-000000000001', 'security_admin');
--
-- All rows belong to one fixed demo organization and are safe to re-run.

insert into organizations (id, name)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Demo Org')
on conflict (id) do nothing;

insert into security_findings (id, organization_id, connector, resource_ref, finding_type, severity, status, summary, detected_at, updated_at) values
('f0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','github-security','github.com/acme-corp/payments-api','secret_scanning.exposed_credential','critical','investigating','Committed AWS access key detected in payments-api commit history', now() - interval '2 hours', now() - interval '1 hour'),
('f0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','crowdstrike-falcon','falcon-host/prod-web-07','edr.suspicious_process_injection','critical','open','Process injection technique detected on prod-web-07', now() - interval '4 hours', now() - interval '4 hours'),
('f0000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','aws-security-hub','arn:aws:s3:::acme-reports-bucket','s3.public_bucket','high','open','S3 bucket acme-reports-bucket is publicly readable', now() - interval '9 hours', now() - interval '9 hours'),
('f0000000-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','microsoft-sentinel','user/jtorres@acme-corp.com','sentinel.impossible_travel_signin','high','investigating','Sign-in from Lagos and Warsaw within an implausible time window', now() - interval '14 hours', now() - interval '6 hours'),
('f0000000-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','tenable-io','tenable-asset/db-primary-02','vuln.unpatched_cve','high','open','CVE-2025-21412 (known exploit) unpatched on db-primary-02', now() - interval '1 day', now() - interval '1 day'),
('f0000000-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000001','aws-security-hub','arn:aws:iam::412:role/legacy-ci-deploy','iam.unused_access_key','medium','open','IAM access key unused for 112 days (dormancy threshold: 90d)', now() - interval '2 days', now() - interval '2 days'),
('f0000000-0000-0000-0000-000000000007','aaaaaaaa-0000-0000-0000-000000000001','github-security','github.com/acme-corp/internal-tools','dependabot.vulnerable_dependency','medium','remediated','lodash 4.17.15 has a known prototype pollution vulnerability', now() - interval '5 days', now() - interval '3 days'),
('f0000000-0000-0000-0000-000000000008','aaaaaaaa-0000-0000-0000-000000000001','tenable-io','tenable-asset/web-staging-03','vuln.outdated_tls','low','accepted_risk','TLS 1.1 still enabled on staging load balancer', now() - interval '9 days', now() - interval '4 days')
on conflict (id) do nothing;

insert into remediation_actions (id, organization_id, finding_id, action_type, description, status, auto_approved, executed_at, created_at) values
('b0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','rotate_secret','Rotate credential exposed at github.com/acme-corp/payments-api','pending_approval',false,null, now() - interval '2 hours'),
('b0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','isolate_endpoint','Isolate falcon-host/prod-web-07 pending investigation','pending_approval',false,null, now() - interval '4 hours'),
('b0000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000006','revoke_access','Revoke unused IAM access key legacy-ci-deploy','proposed',false,null, now() - interval '2 days'),
('b0000000-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000007','open_ticket','Patch SLA breach risk for lodash dependency','executed',true, now() - interval '3 days', now() - interval '5 days')
on conflict (id) do nothing;

insert into compliance_requests (id, organization_id, request_type, source, title, status, due_date, created_at, updated_at) values
('c0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','security_questionnaire','acme-customer-procurement@bigbank.com','BigBank Vendor Security Questionnaire','pending_review', current_date + 4, now() - interval '1 day', now() - interval '10 hours'),
('c0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','rfp',null,'RFP: Northwind Logistics','in_progress', current_date + 10, now() - interval '3 days', now() - interval '1 day'),
('c0000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','governance_review','soc2-gap-analysis','SOC2 gap analysis — 3 unmapped control(s)','intake', null, now() - interval '18 hours', now() - interval '18 hours'),
('c0000000-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','internal_audit',null,'Control test: Encryption at rest','completed', null, now() - interval '6 days', now() - interval '6 days')
on conflict (id) do nothing;

insert into compliance_questions (id, request_id, organization_id, question_text, answer_text, confidence, flagged_gap, gap_reason, answered_at, created_at) values
('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Do you encrypt customer data at rest?','Yes. All customer data at rest is encrypted using AES-256 [1], enforced via our cloud infrastructure encryption policy [2].',0.80,false,null, now() - interval '10 hours', now() - interval '1 day'),
('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Do you maintain a current SOC 2 Type II report?',null,0,true,'No evidence found in the graph for this question.', now() - interval '10 hours', now() - interval '1 day'),
('d0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Describe your incident response process.','Our incident response plan [1] defines a 4-hour acknowledgement SLA and escalation chain reviewed quarterly.',0.80,false,null, now() - interval '1 day', now() - interval '3 days')
on conflict (id) do nothing;

insert into connector_configs (organization_id, connector_type, enabled, credential_ref, last_sync_at) values
('aaaaaaaa-0000-0000-0000-000000000001','aws-security-hub',true,'vault:aws-sec-hub-demo', now() - interval '1 hour'),
('aaaaaaaa-0000-0000-0000-000000000001','github-security',true,'vault:github-app-demo', now() - interval '2 hours'),
('aaaaaaaa-0000-0000-0000-000000000001','microsoft-sentinel',true,null, now() - interval '14 hours'),
('aaaaaaaa-0000-0000-0000-000000000001','crowdstrike-falcon',true,'vault:falcon-demo', now() - interval '4 hours'),
('aaaaaaaa-0000-0000-0000-000000000001','tenable-io',false,null,null),
('aaaaaaaa-0000-0000-0000-000000000001','siem-webhook',false,null,null)
on conflict (organization_id, connector_type) do nothing;

insert into approval_requests (id, organization_id, ref_type, ref_id, status, created_at) values
('e0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','remediation_action','b0000000-0000-0000-0000-000000000001','pending', now() - interval '2 hours'),
('e0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','remediation_action','b0000000-0000-0000-0000-000000000002','pending', now() - interval '4 hours'),
('e0000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','compliance_answer','d0000000-0000-0000-0000-000000000001','pending', now() - interval '10 hours')
on conflict (id) do nothing;

insert into playbook_runs (id, organization_id, playbook_id, category, status, summary, findings_created, gaps_flagged, started_at, finished_at) values
('a0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','cloud-misconfiguration-sweep','cybersecurity','completed','2 cloud misconfiguration finding(s) recorded.',2,0, now() - interval '1 hour', now() - interval '1 hour'),
('a0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','soc2-evidence-freshness-sweep','compliance','completed','4 stale evidence node(s) found; 2 auto-refreshed, 2 escalated to owners.',0,2, now() - interval '6 hours', now() - interval '6 hours'),
('a0000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','dormant-privileged-access','cybersecurity','completed','Reviewed 2 identity connector(s); 1 dormant privileged access finding(s) created.',1,0, now() - interval '2 days', now() - interval '2 days'),
('a0000000-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','policy-framework-gap-analysis','compliance','completed','SOC2: 13/16 controls have matching evidence; 3 gap(s) logged.',0,3, now() - interval '18 hours', now() - interval '18 hours'),
('a0000000-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','vulnerability-prioritization','cybersecurity','failed','tenable-io is not enabled for this org (see /cyber connectors).',0,0, now() - interval '1 day', now() - interval '1 day')
on conflict (id) do nothing;

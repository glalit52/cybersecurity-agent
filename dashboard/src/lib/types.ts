// Row shapes mirror supabase/migrations/0001_enterprise_trust_agent_schema.sql
// and 0003_playbooks_and_extensions.sql exactly (snake_case, as returned by
// supabase-js) rather than the camelCase types in the Edge Functions —
// this file is the dashboard's own view of the schema, read directly via
// Supabase (RLS-scoped to the signed-in user's org), not through the
// agent HTTP APIs.

export type FindingSeverity = "low" | "medium" | "high" | "critical";
export type FindingStatus = "open" | "investigating" | "remediated" | "accepted_risk" | "false_positive";

export interface SecurityFinding {
  id: string;
  organization_id: string;
  connector: string;
  resource_ref: string;
  finding_type: string;
  severity: FindingSeverity;
  status: FindingStatus;
  summary: string;
  evidence: Record<string, unknown>;
  related_node_ids: string[];
  detected_at: string;
  updated_at: string;
}

export type RemediationStatus =
  | "proposed"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";

export interface RemediationAction {
  id: string;
  organization_id: string;
  finding_id: string | null;
  action_type: string;
  description: string;
  status: RemediationStatus;
  auto_approved: boolean;
  requested_by: string | null;
  approved_by: string | null;
  executed_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export type ComplianceRequestType =
  | "rfp"
  | "security_questionnaire"
  | "soc2_evidence"
  | "iso_evidence"
  | "customer_due_diligence"
  | "vendor_assessment"
  | "procurement_questionnaire"
  | "internal_audit"
  | "governance_review";

export type ComplianceRequestStatus = "intake" | "in_progress" | "pending_review" | "completed" | "archived";

export interface ComplianceRequest {
  id: string;
  organization_id: string;
  request_type: ComplianceRequestType;
  source: string | null;
  title: string;
  status: ComplianceRequestStatus;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceQuestion {
  id: string;
  request_id: string;
  organization_id: string;
  question_text: string;
  answer_text: string | null;
  evidence_node_ids: string[];
  confidence: number | null;
  flagged_gap: boolean;
  gap_reason: string | null;
  answered_at: string | null;
  created_at: string;
}

export interface ConnectorConfig {
  id: string;
  organization_id: string;
  connector_type: string;
  enabled: boolean;
  credential_ref: string | null;
  config: Record<string, unknown>;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ApprovalRefType = "remediation_action" | "compliance_answer";
export type ApprovalStatus = "pending" | "locked" | "approved" | "rejected" | "expired";

export interface ApprovalRequest {
  id: string;
  organization_id: string;
  ref_type: ApprovalRefType;
  ref_id: string;
  requested_by: string | null;
  eligible_approver_ids: string[];
  status: ApprovalStatus;
  locked_by: string | null;
  locked_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  channel_ref: string | null;
  created_at: string;
}

export type PlaybookRunStatus = "running" | "completed" | "failed";

export interface PlaybookRun {
  id: string;
  organization_id: string;
  playbook_id: string;
  category: "cybersecurity" | "compliance";
  status: PlaybookRunStatus;
  summary: string | null;
  data: Record<string, unknown>;
  findings_created: number;
  gaps_flagged: number;
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface EvidenceNode {
  id: string;
  organization_id: string;
  node_type: "policy" | "system" | "control" | "evidence" | "owner" | "contract" | "rfp_response";
  title: string;
  content: string | null;
  source_connector: string | null;
  current_as_of: string | null;
  freshness_days: number;
  owner_id: string | null;
}

// Static catalog of the 16 playbooks (code-registered, not a DB table —
// see supabase/functions/_shared/playbooks/register-all.ts). Mirrors
// TECHNICAL_SPEC.md §4's catalog table exactly.
export interface PlaybookCatalogEntry {
  id: string;
  category: "cybersecurity" | "compliance";
  title: string;
  description: string;
  trigger: "manual" | "scheduled" | "event";
}

export const PLAYBOOK_CATALOG: PlaybookCatalogEntry[] = [
  {
    id: "dormant-privileged-access",
    category: "cybersecurity",
    title: "Dormant Privileged Access Review",
    description: "Flags privileged accounts/roles unused beyond a configurable threshold and proposes revocation.",
    trigger: "scheduled",
  },
  {
    id: "cloud-misconfiguration-sweep",
    category: "cybersecurity",
    title: "Cloud Misconfiguration Sweep",
    description: "Detects public storage, overly permissive network rules, and unencrypted resources.",
    trigger: "scheduled",
  },
  {
    id: "exposed-secret-response",
    category: "cybersecurity",
    title: "Exposed Secret Response",
    description: "GitHub secret-scanning hit treated as critical; proposes immediate rotation.",
    trigger: "event",
  },
  {
    id: "identity-anomaly-triage",
    category: "cybersecurity",
    title: "Identity Anomaly Triage",
    description: "Correlates SIEM identity-risk signals with account history to decide re-auth vs. escalation.",
    trigger: "event",
  },
  {
    id: "endpoint-threat-containment",
    category: "cybersecurity",
    title: "Endpoint Threat Containment",
    description: "Proposes isolating endpoints with high/critical EDR detections; always human-approved.",
    trigger: "event",
  },
  {
    id: "vulnerability-prioritization",
    category: "cybersecurity",
    title: "Vulnerability Prioritization & Patch SLA",
    description: "Scores findings by severity x asset criticality, opens tickets past SLA threshold.",
    trigger: "scheduled",
  },
  {
    id: "access-recertification-campaign",
    category: "cybersecurity",
    title: "Access Recertification Campaign",
    description: "Requests periodic recertification of privileged access from each control owner.",
    trigger: "scheduled",
  },
  {
    id: "phishing-triage",
    category: "cybersecurity",
    title: "Reported Phishing Triage",
    description: "Extracts IOCs from a reported email, auto-quarantines on high-confidence signals.",
    trigger: "event",
  },
  {
    id: "rfp-response-orchestrator",
    category: "compliance",
    title: "RFP / Questionnaire Response Orchestrator",
    description: "Ingests a full RFP and answers every question from the evidence graph in one run.",
    trigger: "manual",
  },
  {
    id: "soc2-evidence-freshness-sweep",
    category: "compliance",
    title: "SOC 2 / ISO Evidence Freshness Sweep",
    description: "Proactively finds stale evidence; re-verifies live where possible, else escalates.",
    trigger: "scheduled",
  },
  {
    id: "policy-framework-gap-analysis",
    category: "compliance",
    title: "Policy Framework Gap Analysis",
    description: "Diffs the evidence graph against SOC 2/ISO 27001/NIST CSF, logs unmapped controls.",
    trigger: "manual",
  },
  {
    id: "vendor-risk-assessment",
    category: "compliance",
    title: "Vendor Risk Assessment",
    description: "Sends a security questionnaire to a third-party vendor and tracks the response.",
    trigger: "manual",
  },
  {
    id: "regulatory-change-monitor",
    category: "compliance",
    title: "Regulatory Change Monitor",
    description: "Watches industry-relevant regulatory feeds, opens a governance review when relevant.",
    trigger: "scheduled",
  },
  {
    id: "internal-audit-control-testing",
    category: "compliance",
    title: "Internal Audit Control Testing",
    description: "Live-verifies whether a control actually holds across its sampled systems.",
    trigger: "manual",
  },
  {
    id: "contract-compliance-review",
    category: "compliance",
    title: "Contract & DPA Compliance Review",
    description: "Scans contracts for required clauses (DPA terms, breach notification SLA).",
    trigger: "manual",
  },
  {
    id: "training-compliance-tracker",
    category: "compliance",
    title: "Security Training Compliance Tracker",
    description: "Tracks required security-training completion, flags overdue individuals.",
    trigger: "scheduled",
  },
];

export const CONNECTOR_CATALOG = [
  { id: "aws-security-hub", label: "AWS Security Hub" },
  { id: "github-security", label: "GitHub Advanced Security" },
  { id: "microsoft-sentinel", label: "Microsoft Sentinel" },
  { id: "crowdstrike-falcon", label: "CrowdStrike Falcon" },
  { id: "tenable-io", label: "Tenable.io" },
  { id: "siem-webhook", label: "Generic SIEM Webhook" },
] as const;

// Shared types for the Enterprise Trust Agent (Cybersecurity + Compliance agents).
// Mirrors the schema in supabase/migrations/0001_enterprise_trust_agent_schema.sql.

export type EvidenceNodeType =
  | "policy"
  | "system"
  | "control"
  | "evidence"
  | "owner"
  | "contract"
  | "rfp_response";

export interface EvidenceNode {
  id: string;
  organizationId: string;
  nodeType: EvidenceNodeType;
  title: string;
  content: string | null;
  sourceConnector: string | null;
  sourceRef: string | null;
  currentAsOf: string | null;
  freshnessDays: number;
  ownerId: string | null;
}

export type EvidenceRelationType =
  | "control_to_policy"
  | "policy_to_evidence"
  | "evidence_to_system"
  | "control_to_owner"
  | "control_to_system"
  | "evidence_to_contract";

export interface EvidenceEdge {
  id: string;
  organizationId: string;
  fromNodeId: string;
  toNodeId: string;
  relationType: EvidenceRelationType;
}

export type FindingSeverity = "low" | "medium" | "high" | "critical";
export type FindingStatus =
  | "open"
  | "investigating"
  | "remediated"
  | "accepted_risk"
  | "false_positive";

export interface SecurityFinding {
  id: string;
  organizationId: string;
  connector: string;
  resourceRef: string;
  findingType: string;
  severity: FindingSeverity;
  status: FindingStatus;
  summary: string;
  evidence: Record<string, unknown>;
  relatedNodeIds: string[];
  detectedAt: string;
}

export type RemediationActionType =
  | "revoke_access"
  | "disable_key"
  | "rotate_secret"
  | "open_ticket"
  | "notify_owner"
  | "update_config"
  | "other";

export type RemediationStatus =
  | "proposed"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";

export interface RemediationAction {
  id: string;
  organizationId: string;
  findingId: string;
  actionType: RemediationActionType;
  description: string;
  status: RemediationStatus;
  autoApproved: boolean;
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

export interface ComplianceQuestion {
  id: string;
  requestId: string;
  organizationId: string;
  questionText: string;
  answerText: string | null;
  evidenceNodeIds: string[];
  confidence: number | null;
  flaggedGap: boolean;
  gapReason: string | null;
}

export type ApprovalRefType = "remediation_action" | "compliance_answer";
export type ApprovalStatus = "pending" | "locked" | "approved" | "rejected" | "expired";

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  refType: ApprovalRefType;
  refId: string;
  eligibleApproverIds: string[];
  status: ApprovalStatus;
  lockedBy: string | null;
  channelRef: string | null;
}

export type AuditEventType =
  | "finding.detected"
  | "finding.investigated"
  | "remediation.requested"
  | "remediation.approved"
  | "remediation.rejected"
  | "remediation.executed"
  | "compliance.answered"
  | "compliance.flagged_gap"
  | "evidence.updated";

export interface AuditLogEntry {
  organizationId: string;
  actorId: string | null;
  eventType: AuditEventType;
  targetRef: string;
  metadata: Record<string, unknown>;
}

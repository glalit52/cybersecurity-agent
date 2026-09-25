// Import this module once (side-effect import) to register every playbook
// under both agents. Both supabase/functions/cybersecurity-agent/index.ts
// and supabase/functions/compliance-agent/index.ts do this so the registry
// is fully populated regardless of which HTTP entrypoint is hit first.

import { registerPlaybook } from "./base.ts";

import { dormantPrivilegedAccessPlaybook } from "./cyber/dormant-privileged-access.ts";
import { cloudMisconfigurationSweepPlaybook } from "./cyber/cloud-misconfiguration-sweep.ts";
import { exposedSecretResponsePlaybook } from "./cyber/exposed-secret-response.ts";
import { identityAnomalyTriagePlaybook } from "./cyber/identity-anomaly-triage.ts";
import { endpointThreatContainmentPlaybook } from "./cyber/endpoint-threat-containment.ts";
import { vulnerabilityPrioritizationPlaybook } from "./cyber/vulnerability-prioritization.ts";
import { accessRecertificationCampaignPlaybook } from "./cyber/access-recertification-campaign.ts";
import { phishingTriagePlaybook } from "./cyber/phishing-triage.ts";

import { soc2EvidenceFreshnessSweepPlaybook } from "./compliance/soc2-evidence-freshness-sweep.ts";
import { policyFrameworkGapAnalysisPlaybook } from "./compliance/policy-framework-gap-analysis.ts";
import { vendorRiskAssessmentPlaybook } from "./compliance/vendor-risk-assessment.ts";
import { regulatoryChangeMonitorPlaybook } from "./compliance/regulatory-change-monitor.ts";
import { internalAuditControlTestingPlaybook } from "./compliance/internal-audit-control-testing.ts";
import { contractComplianceReviewPlaybook } from "./compliance/contract-compliance-review.ts";
import { trainingComplianceTrackerPlaybook } from "./compliance/training-compliance-tracker.ts";
import { rfpResponseOrchestratorPlaybook } from "./compliance/rfp-response-orchestrator.ts";

[
  dormantPrivilegedAccessPlaybook,
  cloudMisconfigurationSweepPlaybook,
  exposedSecretResponsePlaybook,
  identityAnomalyTriagePlaybook,
  endpointThreatContainmentPlaybook,
  vulnerabilityPrioritizationPlaybook,
  accessRecertificationCampaignPlaybook,
  phishingTriagePlaybook,
  soc2EvidenceFreshnessSweepPlaybook,
  policyFrameworkGapAnalysisPlaybook,
  vendorRiskAssessmentPlaybook,
  regulatoryChangeMonitorPlaybook,
  internalAuditControlTestingPlaybook,
  contractComplianceReviewPlaybook,
  trainingComplianceTrackerPlaybook,
  rfpResponseOrchestratorPlaybook,
].forEach(registerPlaybook);

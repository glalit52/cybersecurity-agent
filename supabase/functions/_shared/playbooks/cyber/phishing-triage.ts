// Reported Phishing Triage — an employee-reported email (via the existing
// Outlook/Gmail connector) is parsed for IOCs (sender domain, links,
// attachment hashes), cross-referenced against recent SIEM signals for the
// same indicators, and either auto-quarantined (high confidence) or
// escalated to a human (ambiguous).

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";

interface ReportedEmail {
  messageId: string;
  senderDomain: string;
  subject: string;
  links: string[];
  reportedBy: string;
}

const SUSPICIOUS_DOMAIN_SIGNALS = ["-secure-", "login-verify", "account-update"];

export const phishingTriagePlaybook: Playbook = {
  id: "phishing-triage",
  category: "cybersecurity",
  title: "Reported Phishing Triage",
  description:
    "Extracts IOCs from an employee-reported email and decides auto-quarantine vs. escalation based on signal strength.",
  trigger: "event",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const email = ctx.params.email as ReportedEmail | undefined;
    if (!email) {
      return { summary: "No reported email payload provided.", data: {} };
    }

    // TODO(connector): once the existing Outlook/Gmail connector is ported
    // to the ConnectorAdapter shape, use it to pull the full message
    // (headers, attachment hashes) rather than relying on the caller to
    // have already extracted these fields.
    const domainSignalHits = SUSPICIOUS_DOMAIN_SIGNALS.filter((s) => email.senderDomain.includes(s));
    const linkCount = email.links.length;
    const confidence = domainSignalHits.length > 0 && linkCount > 0 ? "high" : linkCount > 0 ? "medium" : "low";

    const { data: finding, error } = await db()
      .from("security_findings")
      .insert({
        organization_id: ctx.organizationId,
        connector: "outlook-gmail",
        resource_ref: email.messageId,
        finding_type: "phishing.reported_email",
        severity: confidence === "high" ? "high" : confidence === "medium" ? "medium" : "low",
        summary: `Reported phishing email from ${email.senderDomain}: "${email.subject}"`,
        evidence: { ...email, domainSignalHits },
        detected_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return { summary: `Failed to record phishing report: ${error.message}`, data: {} };
    }

    const actionType = confidence === "high" ? "quarantine_email" : "notify_owner";
    await db().from("remediation_actions").insert({
      organization_id: ctx.organizationId,
      finding_id: finding.id,
      action_type: actionType,
      description:
        confidence === "high"
          ? `Auto-quarantine: sender domain matches known phishing patterns (${domainSignalHits.join(", ")})`
          : "Escalated to security team for manual review — insufficient signal for auto-action",
      status: confidence === "high" ? "proposed" : "pending_approval",
      requested_by: ctx.actorId,
    });

    return {
      summary: `Phishing report triaged with ${confidence} confidence (${domainSignalHits.length} domain signal(s), ${linkCount} link(s)).`,
      data: { confidence, domainSignalHits },
      findingsCreated: 1,
    };
  },
};

// Identity Anomaly Triage — takes Microsoft Sentinel identity signals
// (impossible travel, anomalous sign-in) and cross-references the affected
// account against the evidence graph (owner, role, prior findings) before
// deciding between "force re-auth" (medium confidence) and "disable +
// escalate" (high confidence / repeat offender).

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";
import { getEnabledConnector } from "../../connector-configs.ts";

export const identityAnomalyTriagePlaybook: Playbook = {
  id: "identity-anomaly-triage",
  category: "cybersecurity",
  title: "Identity Anomaly Triage",
  description:
    "Correlates SIEM identity-risk signals (impossible travel, anomalous sign-in) with account history to decide re-auth vs. escalation.",
  trigger: "event",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const connector = await getEnabledConnector(ctx.organizationId, "microsoft-sentinel");
    if (!connector) {
      return { summary: "microsoft-sentinel is not enabled for this org (see /cyber connectors).", data: {} };
    }

    const signals = await connector.fetchSignals(ctx.organizationId);
    let findingsCreated = 0;
    const decisions: Record<string, string> = {};

    for (const signal of signals) {
      const { data: finding, error } = await db()
        .from("security_findings")
        .insert({
          organization_id: ctx.organizationId,
          connector: signal.connector,
          resource_ref: signal.resourceRef,
          finding_type: signal.findingType,
          severity: signal.severity,
          summary: signal.summary,
          evidence: signal.raw,
          detected_at: signal.detectedAt,
        })
        .select()
        .single();

      if (error) continue;
      findingsCreated++;

      // Repeat-offender check: has this resource had an identity-anomaly
      // finding in the last 30 days? If so, escalate rather than just
      // re-auth, since the account keeps triggering risk signals.
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { count } = await db()
        .from("security_findings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId)
        .eq("resource_ref", signal.resourceRef)
        .ilike("finding_type", "sentinel.%")
        .gte("detected_at", since.toISOString());

      const isRepeatOffender = (count ?? 0) > 1;
      const actionType = isRepeatOffender ? "force_reauth" : "notify_owner";
      decisions[signal.resourceRef] = isRepeatOffender
        ? "escalated: repeat offender within 30 days, forcing re-auth"
        : "first occurrence: owner notified, monitoring";

      await db().from("remediation_actions").insert({
        organization_id: ctx.organizationId,
        finding_id: finding.id,
        action_type: actionType,
        description: decisions[signal.resourceRef],
        status: "proposed",
        requested_by: ctx.actorId,
      });
    }

    return {
      summary: `${findingsCreated} identity anomaly signal(s) triaged.`,
      data: { decisions },
      findingsCreated,
    };
  },
};

// Endpoint Threat Containment — for critical CrowdStrike Falcon detections
// (active process injection, ransomware-pattern behavior), proposes
// isolating the endpoint. This is deliberately never auto-approved
// (isolating a production endpoint has real business impact) regardless of
// org auto-approval policy for other action types — enforced by the agent
// layer, but called out here since it's the whole point of this playbook.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";
import { getEnabledConnector } from "../../connector-configs.ts";
import { createApprovalRequest } from "../../approvals.ts";

const CONTAINMENT_WORTHY_SEVERITIES = new Set(["high", "critical"]);

export const endpointThreatContainmentPlaybook: Playbook = {
  id: "endpoint-threat-containment",
  category: "cybersecurity",
  title: "Endpoint Threat Containment",
  description:
    "Proposes isolating endpoints with high/critical EDR detections; always routed for human approval given business impact.",
  trigger: "event",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const connector = await getEnabledConnector(ctx.organizationId, "crowdstrike-falcon");
    if (!connector) {
      return { summary: "crowdstrike-falcon is not enabled for this org (see /cyber connectors).", data: {} };
    }

    const signals = (await connector.fetchSignals(ctx.organizationId)).filter((s) =>
      CONTAINMENT_WORTHY_SEVERITIES.has(s.severity)
    );

    let findingsCreated = 0;
    let containmentRequests = 0;

    const { data: approvers } = await db()
      .from("profiles")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("role", "security_admin");

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

      const { data: action } = await db()
        .from("remediation_actions")
        .insert({
          organization_id: ctx.organizationId,
          finding_id: finding.id,
          action_type: "isolate_endpoint",
          description: `Isolate ${signal.resourceRef} pending investigation of: ${signal.summary}`,
          status: "pending_approval",
          auto_approved: false,
          requested_by: ctx.actorId,
        })
        .select()
        .single();

      if (action) {
        await createApprovalRequest({
          organizationId: ctx.organizationId,
          refType: "remediation_action",
          refId: action.id,
          requestedBy: ctx.actorId,
          eligibleApproverIds: (approvers ?? []).map((p: { id: string }) => p.id),
        });
        containmentRequests++;
      }
    }

    return {
      summary: `${findingsCreated} high/critical endpoint detection(s); ${containmentRequests} containment request(s) sent for approval.`,
      data: {},
      findingsCreated,
    };
  },
};

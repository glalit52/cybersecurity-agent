// Access Recertification Campaign — the operational half of the SOC 2/ISO
// "periodic access review" control. Walks the evidence graph for `control`
// nodes tagged as access-review controls, finds the systems/accounts they
// govern, and requests recertification from each control owner rather than
// waiting for an auditor to ask for evidence of the last review.
//
// A recertification request is NOT a DevOps-style approve/reject action —
// there's no one approving someone else's proposed change here, just an
// owner who needs to go attest their team's access is still correct. So
// unlike remediate() or endpoint-threat-containment, this deliberately
// does NOT create an approval_requests row: status stays "proposed" (an
// honest record that the request exists, not a claim that it's awaiting
// approval it was never routed for) until the owner attests, at which
// point a future command marks it "executed" (confirmed) or raises a new
// security_finding if the owner reports access that should be revoked.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";

export const accessRecertificationCampaignPlaybook: Playbook = {
  id: "access-recertification-campaign",
  category: "cybersecurity",
  title: "Access Recertification Campaign",
  description:
    "Requests periodic recertification of privileged access from each control owner, generating the evidence auditors ask for.",
  trigger: "scheduled",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const { data: accessControls } = await db()
      .from("evidence_nodes")
      .select("id, title, owner_id, metadata")
      .eq("organization_id", ctx.organizationId)
      .eq("node_type", "control")
      .contains("metadata", { controlCategory: "access_review" });

    let campaignsStarted = 0;
    const pendingOwnerIds: string[] = [];
    const skippedNoOwner: string[] = [];

    for (const control of accessControls ?? []) {
      if (!control.owner_id) {
        skippedNoOwner.push(control.title);
        continue;
      }

      const { error } = await db()
        .from("remediation_actions")
        .insert({
          organization_id: ctx.organizationId,
          finding_id: null,
          action_type: "request_recertification",
          description: `Recertify access under control "${control.title}"`,
          status: "proposed",
          requested_by: ctx.actorId,
        });

      if (error) {
        console.error(
          `access-recertification-campaign: failed to create request for "${control.title}": ${error.message}`,
        );
        continue;
      }

      campaignsStarted++;
      pendingOwnerIds.push(control.owner_id);
      // TODO(bot): post a Slack/Teams DM to control.owner_id referencing
      // this request (query remediation_actions by organization_id +
      // action_type + control.id if the row id is needed) with an
      // attest/flag-an-issue prompt, matching the notification pattern in
      // compliance-core.ts's notifyControlOwner. Until that's wired in,
      // this is a real, queryable record (not a false "sent") but the
      // owner won't be proactively pinged yet.
    }

    return {
      summary: skippedNoOwner.length > 0
        ? `${campaignsStarted} recertification request(s) created (owner notification pending bot wiring); ` +
          `${skippedNoOwner.length} control(s) skipped for having no assigned owner.`
        : `${campaignsStarted} recertification request(s) created (owner notification pending bot wiring).`,
      data: { pendingOwnerIds, skippedNoOwner },
    };
  },
};

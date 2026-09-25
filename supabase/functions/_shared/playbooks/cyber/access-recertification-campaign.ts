// Access Recertification Campaign — the operational half of the SOC 2/ISO
// "periodic access review" control. Walks the evidence graph for `control`
// nodes tagged as access-review controls, finds the systems/accounts they
// govern, and requests recertification from each control owner rather than
// waiting for an auditor to ask for evidence of the last review.

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
    const notified: string[] = [];

    for (const control of accessControls ?? []) {
      if (!control.owner_id) continue;

      const { data: action } = await db()
        .from("remediation_actions")
        .insert({
          organization_id: ctx.organizationId,
          finding_id: null,
          action_type: "request_recertification",
          description: `Recertify access under control "${control.title}"`,
          status: "pending_approval",
          requested_by: ctx.actorId,
        })
        .select()
        .single();

      if (action) {
        campaignsStarted++;
        notified.push(control.title);
      }
    }

    return {
      summary: `${campaignsStarted} access recertification request(s) sent to control owners.`,
      data: { notified },
    };
  },
};

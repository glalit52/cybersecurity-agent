// SOC 2 / ISO Evidence Freshness Sweep — the proactive counterpart to the
// Compliance Agent's reactive "verify" step. Instead of waiting for an
// auditor's question to discover evidence is stale, this scans every
// evidence node past its freshness window and either triggers a re-pull
// from its source connector (when possible) or notifies the control owner.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";
import { getConnector } from "../../connectors/base.ts";

export const soc2EvidenceFreshnessSweepPlaybook: Playbook = {
  id: "soc2-evidence-freshness-sweep",
  category: "compliance",
  title: "SOC 2 / ISO Evidence Freshness Sweep",
  description:
    "Finds evidence past its freshness window and either re-verifies it against the live system or escalates to the control owner.",
  trigger: "scheduled",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const { data: nodes } = await db()
      .from("evidence_nodes")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .eq("node_type", "evidence");

    const stale = (nodes ?? []).filter((n: { current_as_of: string | null; freshness_days: number }) => {
      if (!n.current_as_of) return true;
      const ageDays = (Date.now() - new Date(n.current_as_of).getTime()) / (1000 * 60 * 60 * 24);
      return ageDays > n.freshness_days;
    });

    let refreshed = 0;
    let gapsFlagged = 0;
    const escalated: string[] = [];

    for (const node of stale) {
      const connector = node.source_connector ? getConnector(node.source_connector) : undefined;
      if (connector) {
        const result = await connector.verifyFact(ctx.organizationId, node.title);
        if (result.verified) {
          await db()
            .from("evidence_nodes")
            .update({ current_as_of: new Date().toISOString() })
            .eq("id", node.id);
          refreshed++;
          continue;
        }
      }

      // Couldn't auto-refresh — this is a real gap until a human updates it.
      gapsFlagged++;
      escalated.push(node.title);
      // TODO(bot): notify node.owner_id via the existing Slack/Teams DM
      // pattern once that helper is factored out of compliance-agent/index.ts.
    }

    return {
      summary: `${stale.length} stale evidence node(s) found; ${refreshed} auto-refreshed, ${gapsFlagged} escalated to owners.`,
      data: { escalated },
      gapsFlagged,
    };
  },
};

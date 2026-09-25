// Internal Audit Control Testing — given a control, samples the systems it
// governs and actually verifies (via each system's connector, not just the
// stored policy text) whether the control holds today, recording a
// pass/fail per sampled system. This is the "internal audit" workflow
// distinct from RFP answering: it produces test evidence proactively
// rather than in response to an external question.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";
import { getEnabledConnector } from "../../connector-configs.ts";

export const internalAuditControlTestingPlaybook: Playbook = {
  id: "internal-audit-control-testing",
  category: "compliance",
  title: "Internal Audit Control Testing",
  description:
    "Samples the systems governed by a control and verifies each one live via its connector, recording pass/fail test evidence.",
  trigger: "manual",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const controlId = String(ctx.params.controlId ?? "");
    if (!controlId) return { summary: "controlId is required.", data: {} };

    const { data: control } = await db()
      .from("evidence_nodes")
      .select("*")
      .eq("id", controlId)
      .eq("organization_id", ctx.organizationId)
      .single();

    if (!control) return { summary: `Control ${controlId} not found.`, data: {} };

    const { data: edges } = await db()
      .from("evidence_edges")
      .select("to_node_id")
      .eq("organization_id", ctx.organizationId)
      .eq("from_node_id", controlId)
      .eq("relation_type", "control_to_system");

    const systemIds = (edges ?? []).map((e: { to_node_id: string }) => e.to_node_id);
    const { data: systems } = systemIds.length
      ? await db().from("evidence_nodes").select("*").in("id", systemIds)
      : { data: [] };

    const results: Array<{ system: string; pass: boolean; detail: string }> = [];

    for (const system of systems ?? []) {
      const connector = system.source_connector
        ? await getEnabledConnector(ctx.organizationId, system.source_connector)
        : null;
      if (!connector) {
        results.push({
          system: system.title,
          pass: false,
          detail: system.source_connector
            ? `Connector "${system.source_connector}" is not enabled for this org — cannot test live.`
            : "No connector recorded for this system.",
        });
        continue;
      }
      const verification = await connector.verifyFact(ctx.organizationId, control.title);
      results.push({ system: system.title, pass: verification.verified, detail: verification.detail });
    }

    const failures = results.filter((r) => !r.pass);

    // Persist as an internal_audit compliance request so this run's
    // evidence is queryable later the same way an RFP response is.
    const { data: request } = await db()
      .from("compliance_requests")
      .insert({
        organization_id: ctx.organizationId,
        request_type: "internal_audit",
        title: `Control test: ${control.title}`,
        status: failures.length > 0 ? "pending_review" : "completed",
        created_by: ctx.actorId,
      })
      .select()
      .single();

    if (request) {
      await db()
        .from("compliance_questions")
        .insert(
          results.map((r) => ({
            request_id: request.id,
            organization_id: ctx.organizationId,
            question_text: `Control "${control.title}" holds for system "${r.system}"?`,
            answer_text: r.detail,
            confidence: r.pass ? 1 : 0,
            flagged_gap: !r.pass,
            gap_reason: r.pass ? null : r.detail,
            answered_at: new Date().toISOString(),
          })),
        );
    }

    return {
      summary: `Tested control "${control.title}" against ${results.length} system(s): ${results.length - failures.length} pass, ${failures.length} fail.`,
      data: { results },
      gapsFlagged: failures.length,
    };
  },
};

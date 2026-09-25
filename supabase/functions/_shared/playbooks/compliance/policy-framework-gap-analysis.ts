// Policy Framework Gap Analysis — diffs the org's evidence graph against a
// reference control catalog (see ../../frameworks.ts) and reports which
// controls have no matching policy/evidence node at all. This is what lets
// the platform answer "are we ready for a SOC 2 audit?" before the auditor
// asks, rather than only answering individual questionnaire items.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";
import { REFERENCE_CONTROLS } from "../../frameworks.ts";

export const policyFrameworkGapAnalysisPlaybook: Playbook = {
  id: "policy-framework-gap-analysis",
  category: "compliance",
  title: "Policy Framework Gap Analysis",
  description:
    "Diffs the evidence graph against a reference control catalog (SOC 2 / ISO 27001 / NIST CSF) and reports unmapped controls.",
  trigger: "manual",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const frameworkId = (ctx.params.frameworkId as string | undefined) ?? "soc2";
    const controls = REFERENCE_CONTROLS.filter((c) => c.frameworkId === frameworkId);

    const { data: policyNodes } = await db()
      .from("evidence_nodes")
      .select("content")
      .eq("organization_id", ctx.organizationId)
      .in("node_type", ["policy", "control", "evidence"]);

    const corpus = (policyNodes ?? [])
      .map((n: { content: string | null }) => (n.content ?? "").toLowerCase())
      .join(" \n ");

    const covered: string[] = [];
    const gaps: Array<{ controlRef: string; title: string }> = [];

    for (const control of controls) {
      const matched = control.keywords.some((kw) => corpus.includes(kw.toLowerCase()));
      if (matched) {
        covered.push(control.controlRef);
      } else {
        gaps.push({ controlRef: control.controlRef, title: control.title });
      }
    }

    // Record each gap as a compliance_requests entry of type governance_review
    // so it shows up alongside real audit/RFP work instead of only living in
    // this run's transient result.
    if (gaps.length > 0) {
      const { data: request } = await db()
        .from("compliance_requests")
        .insert({
          organization_id: ctx.organizationId,
          request_type: "governance_review",
          title: `${frameworkId.toUpperCase()} gap analysis — ${gaps.length} unmapped control(s)`,
          status: "intake",
          created_by: ctx.actorId,
        })
        .select()
        .single();

      if (request) {
        await db()
          .from("compliance_questions")
          .insert(
            gaps.map((g) => ({
              request_id: request.id,
              organization_id: ctx.organizationId,
              question_text: `No policy/evidence found for ${g.controlRef}: ${g.title}`,
              flagged_gap: true,
              gap_reason: "No matching evidence node in the graph for this control.",
            })),
          );
      }
    }

    return {
      summary: `${frameworkId.toUpperCase()}: ${covered.length}/${controls.length} controls have matching evidence; ${gaps.length} gap(s) logged.`,
      data: { frameworkId, covered, gaps },
      gapsFlagged: gaps.length,
    };
  },
};

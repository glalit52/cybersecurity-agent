// Contract & DPA Compliance Review — scans contract evidence nodes
// (ingested from the document store / Google Drive / SharePoint via the
// existing connectors) for required clauses (data processing terms, breach
// notification SLA, sub-processor disclosure) using a keyword check today,
// with a clear upgrade path to semantic clause extraction once the
// reasoning pipeline is wired in.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";

interface RequiredClause {
  id: string;
  label: string;
  keywords: string[];
}

const REQUIRED_CLAUSES: RequiredClause[] = [
  { id: "dpa", label: "Data Processing Agreement terms", keywords: ["data processing agreement", "processor", "controller"] },
  { id: "breach_notification", label: "Breach notification SLA", keywords: ["breach notification", "notify within", "security incident"] },
  { id: "subprocessor_disclosure", label: "Sub-processor disclosure", keywords: ["sub-processor", "subcontractor", "third-party processor"] },
  { id: "data_retention", label: "Data retention/deletion terms", keywords: ["data retention", "deletion upon termination", "data destruction"] },
  { id: "audit_rights", label: "Audit rights clause", keywords: ["right to audit", "audit rights"] },
];

export const contractComplianceReviewPlaybook: Playbook = {
  id: "contract-compliance-review",
  category: "compliance",
  title: "Contract & DPA Compliance Review",
  description:
    "Checks contract evidence nodes for required clauses (DPA terms, breach notification SLA, sub-processor disclosure) and flags what's missing.",
  trigger: "manual",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const contractId = ctx.params.contractId as string | undefined;

    const query = db()
      .from("evidence_nodes")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .eq("node_type", "contract");
    const { data: contracts } = contractId ? await query.eq("id", contractId) : await query;

    const reviewResults: Array<{ contract: string; missingClauses: string[] }> = [];
    let totalGaps = 0;

    for (const contract of contracts ?? []) {
      const content = (contract.content ?? "").toLowerCase();
      const missing = REQUIRED_CLAUSES.filter(
        (clause) => !clause.keywords.some((kw) => content.includes(kw.toLowerCase())),
      );

      reviewResults.push({ contract: contract.title, missingClauses: missing.map((m) => m.label) });
      totalGaps += missing.length;

      if (missing.length > 0) {
        const { data: request } = await db()
          .from("compliance_requests")
          .insert({
            organization_id: ctx.organizationId,
            request_type: "governance_review",
            title: `Contract review gap: ${contract.title}`,
            status: "intake",
            created_by: ctx.actorId,
          })
          .select()
          .single();

        if (request) {
          await db()
            .from("compliance_questions")
            .insert(
              missing.map((clause) => ({
                request_id: request.id,
                organization_id: ctx.organizationId,
                question_text: `Contract "${contract.title}" is missing: ${clause.label}`,
                flagged_gap: true,
                gap_reason: `No "${clause.label}" clause detected via keyword scan — TODO(reasoning): confirm with semantic clause extraction before treating as a confirmed gap.`,
              })),
            );
        }
      }
    }

    return {
      summary: `Reviewed ${reviewResults.length} contract(s); ${totalGaps} missing clause(s) flagged.`,
      data: { reviewResults },
      gapsFlagged: totalGaps,
    };
  },
};

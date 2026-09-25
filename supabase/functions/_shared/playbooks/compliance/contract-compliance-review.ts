// Contract & DPA Compliance Review — scans contract evidence nodes
// (ingested from the document store / Google Drive / SharePoint via the
// existing connectors) for required clauses (data processing terms, breach
// notification SLA, sub-processor disclosure). Keyword matching is a cheap
// first pass; anything it doesn't find gets one AI Gateway confirmation
// pass before being logged as a real gap, since contracts phrase the same
// clause many different ways and a keyword miss alone is a weak signal.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";
import { generateCompletion, AiGatewayUnavailableError } from "../../ai-gateway.ts";

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
      const keywordMisses = REQUIRED_CLAUSES.filter(
        (clause) => !clause.keywords.some((kw) => content.includes(kw.toLowerCase())),
      );

      // Confirm each keyword miss with the AI Gateway before treating it as
      // a real gap — falls back to trusting the keyword result if the
      // gateway is unavailable, same posture as the rest of the reasoning
      // layer.
      const missing: Array<{ clause: RequiredClause; reason: string }> = [];
      for (const clause of keywordMisses) {
        const confirmed = await confirmClauseMissing(clause, contract.content ?? "");
        if (confirmed.missing) missing.push({ clause, reason: confirmed.reason });
      }

      reviewResults.push({ contract: contract.title, missingClauses: missing.map((m) => m.clause.label) });
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
              missing.map((m) => ({
                request_id: request.id,
                organization_id: ctx.organizationId,
                question_text: `Contract "${contract.title}" is missing: ${m.clause.label}`,
                flagged_gap: true,
                gap_reason: m.reason,
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

async function confirmClauseMissing(
  clause: RequiredClause,
  contractText: string,
): Promise<{ missing: boolean; reason: string }> {
  if (!contractText.trim()) {
    return { missing: true, reason: `Contract has no extracted text to review for "${clause.label}".` };
  }

  try {
    const response = await generateCompletion({
      systemPrompt:
        "You review contracts for required compliance clauses. You will be given a clause " +
        "description and full contract text. Answer with exactly one line: either " +
        '"PRESENT: <one sentence quoting or paraphrasing where it appears>" or ' +
        '"MISSING: <one sentence explaining what is absent>". The clause may use different ' +
        "wording than the label — look for the substance, not exact keyword matches.",
      userPrompt: `Required clause: ${clause.label}\n\nContract text:\n${contractText.slice(0, 12000)}`,
      maxTokens: 150,
    });

    const isPresent = response.trim().toUpperCase().startsWith("PRESENT");
    return {
      missing: !isPresent,
      reason: isPresent
        ? response // present after all — caller won't log this as a gap, but keep for logging/debug
        : `No "${clause.label}" clause found (keyword scan + AI Gateway confirmation both missed it): ${response}`,
    };
  } catch (err) {
    if (!(err instanceof AiGatewayUnavailableError)) throw err;
    console.error(`contract-compliance-review: confirmation unavailable, trusting keyword scan: ${err.message}`);
    return {
      missing: true,
      reason: `No "${clause.label}" clause detected via keyword scan (AI Gateway unavailable for confirmation — treat as provisional until reviewed).`,
    };
  }
}

// Core Compliance/Audit/Governance/RFP Agent logic: Ingest -> Retrieve ->
// Verify -> Generate -> Attach & flag -> Route for approval.
//
// Mirrors the worked example in the Oodles V2 concept doc: "Do you encrypt
// customer data at rest?" -> find the policy, verify live config, locate
// prior audit evidence, identify the control owner, check freshness,
// generate the answer, attach evidence, flag gaps.
//
// Extracted out of supabase/functions/compliance-agent/index.ts (which is
// now a thin HTTP wrapper around this module) so the same logic is
// reusable from the rfp-response-orchestrator playbook without duplicating
// ~150 lines or triggering a second Deno.serve() on import.

import { db } from "./db.ts";
import { auditEntry, writeAuditLog } from "./audit.ts";
import { createApprovalRequest } from "./approvals.ts";
import { getEnabledConnector } from "./connector-configs.ts";
import { semanticSearchByText, isStale } from "./evidence-graph-core.ts";
import { generateCompletion, AiGatewayUnavailableError } from "./ai-gateway.ts";
import { ApprovalRequest, ComplianceQuestion, ComplianceRequestType, EvidenceNode } from "./types.ts";

// ---------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------

export async function createRequest(
  orgId: string,
  actorId: string | null,
  requestType: ComplianceRequestType,
  title: string,
  questions: string[],
  dueDate?: string,
) {
  const { data: request, error } = await db()
    .from("compliance_requests")
    .insert({
      organization_id: orgId,
      request_type: requestType,
      title,
      due_date: dueDate ?? null,
      created_by: actorId,
      status: "intake",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create compliance request: ${error.message}`);

  const { data: questionRows, error: qError } = await db()
    .from("compliance_questions")
    .insert(
      questions.map((q) => ({
        request_id: request.id,
        organization_id: orgId,
        question_text: q,
      })),
    )
    .select();

  if (qError) throw new Error(`Failed to create compliance questions: ${qError.message}`);

  return { request, questions: (questionRows ?? []).map(mapQuestionRow) };
}

// ---------------------------------------------------------------------
// Retrieve -> Verify -> Generate -> Attach & flag
// ---------------------------------------------------------------------

export async function answerQuestion(
  orgId: string,
  actorId: string | null,
  questionId: string,
): Promise<ComplianceQuestion> {
  const { data: question, error } = await db()
    .from("compliance_questions")
    .select("*")
    .eq("id", questionId)
    .eq("organization_id", orgId)
    .single();
  if (error || !question) throw new Error(`Question ${questionId} not found for org ${orgId}`);

  // 1. Retrieve: semantic search over the evidence graph (embeds the
  // question via the AI Gateway; falls back to keyword match if the
  // gateway is unavailable — see evidence-graph-core.semanticSearchByText).
  const { results: candidates, usedFallback: retrievalUsedFallback } = await semanticSearchByText(
    orgId,
    question.question_text,
  );

  // 2. Verify: for any candidate backed by a live system, cross-check the
  // connector before trusting the stored evidence.
  const verifications = (
    await Promise.all(
      candidates
        .filter((n) => n.sourceConnector)
        .map(async (n) => {
          // Re-checks enablement, not just that the evidence node was once
          // authored from this connector — an org may have disabled it
          // since, in which case we trust the stored evidence as-is
          // instead of silently skipping verification.
          const connector = await getEnabledConnector(orgId, n.sourceConnector!);
          if (!connector) return null;
          const result = await connector.verifyFact(orgId, question.question_text);
          return { node: n, ...result };
        }),
    )
  ).filter((v): v is { node: EvidenceNode; verified: boolean; detail: string } => v !== null);

  // 3. Freshness check.
  const staleNodes = candidates.filter((n) => isStale(n));
  const flaggedGap = candidates.length === 0 || staleNodes.length === candidates.length;

  // 4. Generate: draft the answer from the retrieved evidence + any live
  // verification results, with inline citations. Falls back to a plain
  // evidence listing (no generated prose) if the AI Gateway is unavailable
  // — the citations are still useful without a drafted paragraph.
  let answerText: string | null = null;
  if (!flaggedGap) {
    answerText = await draftAnswer(question.question_text, candidates, verifications);
  }

  const confidence = flaggedGap ? 0 : candidates.length >= 2 ? 0.8 : 0.5;

  const { data: updated, error: updateError } = await db()
    .from("compliance_questions")
    .update({
      answer_text: answerText,
      evidence_node_ids: candidates.map((c) => c.id),
      confidence,
      flagged_gap: flaggedGap,
      gap_reason: flaggedGap
        ? candidates.length === 0
          ? "No evidence found in the graph for this question."
          : "All matching evidence is stale (past its configured freshness window)."
        : null,
      answered_at: new Date().toISOString(),
    })
    .eq("id", questionId)
    .select()
    .single();

  if (updateError) throw new Error(`Failed to update question: ${updateError.message}`);

  await writeAuditLog(
    auditEntry(orgId, actorId, flaggedGap ? "compliance.flagged_gap" : "compliance.answered", questionId, {
      evidenceCount: candidates.length,
      confidence,
      retrievalUsedFallback,
    }),
  );

  if (flaggedGap) {
    await notifyControlOwner(orgId, candidates);
  }

  return mapQuestionRow(updated);
}

interface VerificationResult {
  node: EvidenceNode;
  verified: boolean;
  detail: string;
}

/**
 * Drafts the answer text from retrieved evidence + live verification
 * results via the AI Gateway, with inline citations back to each node's
 * title. If the gateway is unavailable, falls back to a plain evidence
 * listing rather than failing the whole answer — the citations are still
 * useful to a human reviewer without generated prose.
 */
async function draftAnswer(
  questionText: string,
  candidates: EvidenceNode[],
  verifications: VerificationResult[],
): Promise<string> {
  try {
    const evidenceBlock = candidates
      .map((c, i) => {
        const verification = verifications.find((v) => v.node.id === c.id);
        const verificationNote = verification
          ? ` [live verification: ${verification.verified ? "confirmed" : "could not confirm"} — ${verification.detail}]`
          : "";
        return `[${i + 1}] ${c.title} (${c.nodeType}): ${c.content ?? "(no content)"}${verificationNote}`;
      })
      .join("\n\n");

    return await generateCompletion({
      systemPrompt:
        "You are the compliance answer-drafting component of an enterprise trust platform. " +
        "Draft a precise, factual answer to the security/compliance question using ONLY the " +
        "evidence provided below. Cite evidence inline using [1], [2], etc. matching the " +
        "numbered list. If the evidence is insufficient or contradictory, say so explicitly " +
        "rather than guessing. Keep the answer concise — this goes into a customer-facing " +
        "questionnaire response.",
      userPrompt: `Question: ${questionText}\n\nEvidence:\n${evidenceBlock}`,
      maxTokens: 500,
    });
  } catch (err) {
    if (!(err instanceof AiGatewayUnavailableError)) throw err;
    console.error(`compliance-core: answer drafting unavailable, falling back to evidence listing: ${err.message}`);
    const citations = candidates.map((c, i) => `[${i + 1}] ${c.title}`).join("; ");
    return (
      `AI Gateway unavailable — showing matched evidence without a generated narrative. ` +
      `Relevant evidence: ${citations}. A reviewer should draft the final answer from these citations.`
    );
  }
}

async function notifyControlOwner(orgId: string, candidates: EvidenceNode[]) {
  const ownerIds = candidates.map((c) => c.ownerId).filter((id): id is string => Boolean(id));
  if (ownerIds.length === 0) return;
  // TODO: post a Slack/Teams DM to each control owner via the existing bot
  // layer notifying them their evidence is missing/stale for a live request.
  console.log(`TODO(bot): notify control owners ${ownerIds.join(", ")} in org ${orgId} of a compliance gap.`);
}

// ---------------------------------------------------------------------
// Route for approval before an answer leaves the org
// ---------------------------------------------------------------------

export async function routeForApproval(
  orgId: string,
  actorId: string | null,
  questionId: string,
): Promise<ApprovalRequest> {
  const approvers = await eligibleComplianceOfficers(orgId);
  return createApprovalRequest({
    organizationId: orgId,
    refType: "compliance_answer",
    refId: questionId,
    requestedBy: actorId,
    eligibleApproverIds: approvers,
  });
}

async function eligibleComplianceOfficers(orgId: string): Promise<string[]> {
  const { data } = await db()
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("role", "compliance_officer");
  return (data ?? []).map((p: { id: string }) => p.id);
}

// deno-lint-ignore no-explicit-any
function mapQuestionRow(row: any): ComplianceQuestion {
  return {
    id: row.id,
    requestId: row.request_id,
    organizationId: row.organization_id,
    questionText: row.question_text,
    answerText: row.answer_text,
    evidenceNodeIds: row.evidence_node_ids ?? [],
    confidence: row.confidence,
    flaggedGap: row.flagged_gap,
    gapReason: row.gap_reason,
  };
}


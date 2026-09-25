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
import { getConnector } from "./connectors/base.ts";
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

  // 1. Retrieve: semantic search over the evidence graph.
  // TODO(reasoning): generate a real embedding for question.question_text
  // via the AI Gateway before calling evidence-graph's `search` op. Using a
  // direct content match as a placeholder so this is exercisable now.
  const candidates = await retrieveCandidateEvidence(orgId, question.question_text);

  // 2. Verify: for any candidate backed by a live system, cross-check the
  // connector before trusting the stored evidence.
  await Promise.all(
    candidates
      .filter((n) => n.sourceConnector)
      .map(async (n) => {
        const connector = getConnector(n.sourceConnector!);
        if (!connector) return null;
        return connector.verifyFact(orgId, question.question_text);
      }),
  );

  // 3. Freshness check.
  const staleNodes = candidates.filter((n) => isStale(n));
  const flaggedGap = candidates.length === 0 || staleNodes.length === candidates.length;

  // 4. Generate.
  // TODO(reasoning): replace with a real AI Gateway call that drafts the
  // answer from `candidates` + verification results, with inline citations.
  const answerText = flaggedGap
    ? null
    : `TODO(reasoning): draft answer to "${question.question_text}" citing ` +
      `${candidates.map((c) => c.title).join(", ")}.`;

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
    }),
  );

  if (flaggedGap) {
    await notifyControlOwner(orgId, candidates);
  }

  return mapQuestionRow(updated);
}

export async function retrieveCandidateEvidence(orgId: string, questionText: string): Promise<EvidenceNode[]> {
  // Placeholder retrieval until real embeddings are wired in: pull nodes
  // whose content overlaps the question. See evidence-graph/index.ts for
  // the real semantic-search path once embeddings exist.
  const keywords = questionText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 3);

  if (keywords.length === 0) return [];

  const { data } = await db()
    .from("evidence_nodes")
    .select("*")
    .eq("organization_id", orgId)
    .or(keywords.map((k) => `content.ilike.%${k}%`).join(","))
    .limit(5);

  return (data ?? []).map(mapNodeRow);
}

async function notifyControlOwner(orgId: string, candidates: EvidenceNode[]) {
  const ownerIds = candidates.map((c) => c.ownerId).filter((id): id is string => Boolean(id));
  if (ownerIds.length === 0) return;
  // TODO: post a Slack/Teams DM to each control owner via the existing bot
  // layer notifying them their evidence is missing/stale for a live request.
  console.log(`TODO(bot): notify control owners ${ownerIds.join(", ")} in org ${orgId} of a compliance gap.`);
}

function isStale(node: EvidenceNode): boolean {
  if (!node.currentAsOf) return true;
  const ageDays = (Date.now() - new Date(node.currentAsOf).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > node.freshnessDays;
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

// deno-lint-ignore no-explicit-any
function mapNodeRow(row: any): EvidenceNode {
  return {
    id: row.id,
    organizationId: row.organization_id,
    nodeType: row.node_type,
    title: row.title,
    content: row.content,
    sourceConnector: row.source_connector,
    sourceRef: row.source_ref,
    currentAsOf: row.current_as_of,
    freshnessDays: row.freshness_days,
    ownerId: row.owner_id,
  };
}

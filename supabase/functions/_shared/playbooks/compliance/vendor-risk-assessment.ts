// Vendor Risk Assessment — the outbound counterpart to the RFP playbook:
// instead of answering questions ABOUT this org, it sends a questionnaire
// TO a third-party vendor, ingests their response, and scores risk. Stored
// as a compliance_requests row of type "vendor_assessment" so it shares
// tracking/status infrastructure with every other compliance workflow.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";

const STANDARD_VENDOR_QUESTIONS = [
  "Do you maintain a current SOC 2 Type II report or equivalent?",
  "Do you encrypt customer data at rest and in transit?",
  "Do you have a documented incident response plan with defined notification SLAs?",
  "Do you perform regular penetration testing or vulnerability scanning?",
  "Who is your designated security/compliance point of contact?",
];

export const vendorRiskAssessmentPlaybook: Playbook = {
  id: "vendor-risk-assessment",
  category: "compliance",
  title: "Vendor Risk Assessment",
  description:
    "Sends a standard security questionnaire to a third-party vendor and tracks their response for risk scoring.",
  trigger: "manual",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const vendorName = String(ctx.params.vendorName ?? "Unnamed vendor");
    const vendorContact = ctx.params.vendorContact as string | undefined;
    const customQuestions = (ctx.params.questions as string[] | undefined) ?? [];
    const questions = customQuestions.length > 0 ? customQuestions : STANDARD_VENDOR_QUESTIONS;

    const { data: request, error } = await db()
      .from("compliance_requests")
      .insert({
        organization_id: ctx.organizationId,
        request_type: "vendor_assessment",
        title: `Vendor risk assessment: ${vendorName}`,
        source: vendorContact ?? null,
        status: "intake",
        created_by: ctx.actorId,
      })
      .select()
      .single();

    if (error) {
      return { summary: `Failed to create vendor assessment: ${error.message}`, data: {} };
    }

    await db()
      .from("compliance_questions")
      .insert(questions.map((q) => ({ request_id: request.id, organization_id: ctx.organizationId, question_text: q })));

    // TODO(connector): send the questionnaire to vendorContact via the
    // existing Outlook/Gmail connector, and later parse their reply back
    // into compliance_questions.answer_text (mirrors the RFP ingest flow,
    // just in the opposite direction).

    return {
      summary: `Vendor risk assessment created for "${vendorName}" with ${questions.length} question(s) — send-out is a TODO(connector) pending email integration.`,
      data: { requestId: request.id, vendorName },
    };
  },
};

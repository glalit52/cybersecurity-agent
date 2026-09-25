// RFP / Security Questionnaire Response Orchestrator — wraps the core
// ingest -> answer flow (../../compliance-core.ts) as a playbook so a full
// RFP run (many questions, not just one ad-hoc question) shows up in the
// same playbook registry/run-history as every other compliance use case,
// and can be scheduled or batch-triggered the same way.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { createRequest, answerQuestion } from "../../compliance-core.ts";
import { ComplianceRequestType } from "../../types.ts";

export const rfpResponseOrchestratorPlaybook: Playbook = {
  id: "rfp-response-orchestrator",
  category: "compliance",
  title: "RFP / Security Questionnaire Response Orchestrator",
  description:
    "Ingests a full RFP/questionnaire (many questions at once) and answers every question via the evidence graph, flagging gaps for review.",
  trigger: "manual",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const title = String(ctx.params.title ?? "Untitled RFP");
    const requestType = (ctx.params.requestType as ComplianceRequestType | undefined) ?? "rfp";
    const questions = (ctx.params.questions as string[] | undefined) ?? [];
    const dueDate = ctx.params.dueDate as string | undefined;

    if (questions.length === 0) {
      return { summary: "No questions provided to answer.", data: {} };
    }

    const { request, questions: createdQuestions } = await createRequest(
      ctx.organizationId,
      ctx.actorId,
      requestType,
      title,
      questions,
      dueDate,
    );

    let answered = 0;
    let gapsFlagged = 0;

    for (const question of createdQuestions) {
      const result = await answerQuestion(ctx.organizationId, ctx.actorId, question.id);
      if (result.flaggedGap) {
        gapsFlagged++;
      } else {
        answered++;
      }
    }

    return {
      summary: `RFP "${title}": ${answered}/${questions.length} answered from evidence graph, ${gapsFlagged} flagged as gaps needing review.`,
      data: { requestId: request.id },
      gapsFlagged,
    };
  },
};

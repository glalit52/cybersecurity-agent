// Slack/Teams command handlers for the Compliance / Audit / Governance /
// RFP Agent. See cyber.ts for the router-integration assumptions.

import type { CommandContext, CommandHandler } from "../router-types.ts";

const COMPLIANCE_AGENT_URL = Deno.env.get("COMPLIANCE_AGENT_URL") ??
  "http://localhost:54321/functions/v1/compliance-agent";

async function callAgent(action: string, ctx: CommandContext, params: Record<string, unknown>) {
  const res = await fetch(COMPLIANCE_AGENT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action,
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      params,
    }),
  });
  return res.json();
}

const answer: CommandHandler = async (ctx) => {
  const question = ctx.rawArgs.trim();
  if (!question) return ctx.reply('Usage: /compliance answer "<question>"');

  const created = await callAgent("create-request", ctx, {
    requestType: "security_questionnaire",
    title: `Ad-hoc: ${question.slice(0, 60)}`,
    questions: [question],
  });
  const questionId = created.questions?.[0]?.id;
  if (!questionId) return ctx.reply("Failed to create the question — check agent logs.");

  const result = await callAgent("answer", ctx, { questionId });
  if (result.flaggedGap) {
    return ctx.reply(
      `⚠️ Couldn't confidently answer that — ${result.gapReason} The control owner has been notified.`,
    );
  }
  return ctx.reply(`${result.answerText}\n\n_Confidence: ${result.confidence}_`);
};

const rfpUpload: CommandHandler = async (ctx) => {
  // TODO(bot): pull the uploaded file from the Slack/Teams event payload,
  // parse it into discrete questions (reuse the existing Document
  // Processing Agent's extraction pipeline), then call create-request with
  // requestType "rfp" and the parsed questions.
  return ctx.reply(
    "📄 RFP upload received. TODO: wire this to the existing Document Processing Agent's " +
      "extraction pipeline to split the file into individual questions.",
  );
};

const status: CommandHandler = async (ctx) => {
  const requestId = ctx.args[0];
  if (!requestId) return ctx.reply("Usage: /compliance status <request_id>");
  const result = await callAgent("status", ctx, { requestId });
  const questions = result.request?.compliance_questions ?? [];
  const answered = questions.filter((q: { answer_text: string | null }) => q.answer_text).length;
  const gaps = questions.filter((q: { flagged_gap: boolean }) => q.flagged_gap).length;
  return ctx.reply(
    `📋 ${result.request?.title}: ${answered}/${questions.length} answered, ${gaps} flagged as gaps.`,
  );
};

const auditEvidence: CommandHandler = async (ctx) => {
  const controlId = ctx.args[0];
  if (!controlId) return ctx.reply("Usage: /audit evidence <control_id>");
  // TODO: call evidence-graph's `related` op for this control node and
  // format the owning policy/evidence/owner/system chain.
  return ctx.reply(`TODO: fetch evidence chain for control ${controlId} from the evidence-graph service.`);
};

export function registerComplianceCommands(registerCommand: (name: string, handler: CommandHandler) => void) {
  registerCommand("compliance answer", answer);
  registerCommand("compliance rfp upload", rfpUpload);
  registerCommand("compliance status", status);
  registerCommand("audit evidence", auditEvidence);
}

// Slack/Teams command handlers for the Compliance / Audit / Governance /
// RFP Agent. See cyber.ts for the router-integration assumptions.

import type { CommandAttachment, CommandContext, CommandHandler } from "../router-types.ts";
import { downloadSlackFile } from "../adapters/slack.ts";
import { downloadTeamsAttachment } from "../adapters/teams.ts";
import { extractText, DocumentExtractionUnsupportedError } from "../document-extraction.ts";
import { splitIntoQuestions } from "../question-extraction.ts";

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

async function downloadAttachment(
  ctx: CommandContext,
  attachment: CommandAttachment,
): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  // TODO(bot): resolve the per-org bot token via the platform's existing
  // workspace/tenant-linking (Bot Foundation) instead of one shared env
  // var — a single token can't serve multiple orgs' Slack workspaces or
  // Teams tenants in production, but is enough to exercise the download
  // path against a real file in a single-org pilot.
  if (ctx.channel === "slack") {
    const botToken = Deno.env.get("SLACK_BOT_TOKEN");
    if (!botToken) throw new Error("SLACK_BOT_TOKEN is not configured — cannot download the attached file.");
    return downloadSlackFile(attachment.downloadRef, botToken);
  }
  const botToken = Deno.env.get("TEAMS_BOT_TOKEN");
  return downloadTeamsAttachment(
    { name: attachment.filename, contentType: attachment.contentType ?? "application/octet-stream", contentUrl: attachment.downloadRef },
    botToken,
  );
}

const rfpUpload: CommandHandler = async (ctx) => {
  const attachment = ctx.attachments?.[0];
  if (!attachment) {
    return ctx.reply("Attach a file (.txt/.csv, or a questionnaire your platform can extract) with this command.");
  }

  let file: { bytes: Uint8Array; contentType: string; filename: string };
  try {
    file = await downloadAttachment(ctx, attachment);
  } catch (err) {
    return ctx.reply(`❌ Could not download "${attachment.filename}": ${err instanceof Error ? err.message : err}`);
  }

  let extracted: string;
  try {
    extracted = (await extractText(file.bytes, file.contentType, file.filename)).text;
  } catch (err) {
    if (err instanceof DocumentExtractionUnsupportedError) {
      return ctx.reply(`⚠️ ${err.message}`);
    }
    throw err;
  }

  const questions = splitIntoQuestions(extracted);
  if (questions.length === 0) {
    return ctx.reply(`Extracted "${attachment.filename}" but found no question-shaped lines in it.`);
  }

  await ctx.reply(`📄 Parsed ${questions.length} question(s) from "${attachment.filename}" — answering from the evidence graph now...`);

  const result = await callAgent("run-playbook", ctx, {
    playbookId: "rfp-response-orchestrator",
    title: attachment.filename,
    requestType: "rfp",
    questions,
  });
  if (result.error) return ctx.reply(`❌ ${result.error}`);
  return ctx.reply(`✅ ${result.summary}`);
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

const playbooks: CommandHandler = async (ctx) => {
  const result = await callAgent("list-playbooks", ctx, {});
  const list = (result.playbooks ?? []) as Array<{ id: string; title: string; trigger: string }>;
  if (list.length === 0) return ctx.reply("No playbooks registered.");
  const lines = list.map((p) => `• \`${p.id}\` (${p.trigger}) — ${p.title}`);
  return ctx.reply(`Available Compliance playbooks:\n${lines.join("\n")}\n\nRun one with \`/compliance run <id>\`.`);
};

const runPlaybookCommand: CommandHandler = async (ctx) => {
  const playbookId = ctx.args[0];
  if (!playbookId) return ctx.reply("Usage: /compliance run <playbook_id> [key=value ...]");
  // Simple key=value parsing for playbook params beyond the id, e.g.
  // `/compliance run vendor-risk-assessment vendorName=Acme`.
  const params: Record<string, unknown> = {};
  for (const arg of ctx.args.slice(1)) {
    const [key, ...rest] = arg.split("=");
    if (key && rest.length > 0) params[key] = rest.join("=");
  }
  const result = await callAgent("run-playbook", ctx, { playbookId, ...params });
  if (result.error) return ctx.reply(`❌ ${result.error}`);
  return ctx.reply(`✅ ${result.summary}`);
};

export function registerComplianceCommands(registerCommand: (name: string, handler: CommandHandler) => void) {
  registerCommand("compliance answer", answer);
  registerCommand("compliance rfp upload", rfpUpload);
  registerCommand("compliance status", status);
  registerCommand("compliance playbooks", playbooks);
  registerCommand("compliance run", runPlaybookCommand);
  registerCommand("audit evidence", auditEvidence);
}

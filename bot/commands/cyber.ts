// Slack/Teams command handlers for the Cybersecurity Agent, registered with
// the existing "Unified Bot Backend Layer" command router built in Bot
// Foundation (common router across Slack + Teams; see the delivered WBS,
// Milestone 6). This file assumes that router's shape:
//
//   registerCommand(name, handler)
//   handler(ctx: CommandContext) -> reply(text | blocks)
//
// Adjust the import path below once this scaffold is merged into the real
// bot backend repo.

import type { CommandContext, CommandHandler } from "../router-types.ts";

const CYBER_AGENT_URL = Deno.env.get("CYBERSECURITY_AGENT_URL") ??
  "http://localhost:54321/functions/v1/cybersecurity-agent";

async function callAgent(action: string, ctx: CommandContext, params: Record<string, unknown>) {
  const res = await fetch(CYBER_AGENT_URL, {
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

const scan: CommandHandler = async (ctx) => {
  const scope = ctx.args[0] ?? "all";
  const result = await callAgent("scan", ctx, { scope });
  const count = result.findings?.length ?? 0;
  return ctx.reply(`🔍 Scan complete (scope: ${scope}). ${count} new finding(s).`);
};

const findings: CommandHandler = async (ctx) => {
  const severityFlag = ctx.args.find((a) => a.startsWith("--severity="));
  const result = await callAgent("findings", ctx, {});
  let list = result.findings ?? [];
  if (severityFlag) {
    const severity = severityFlag.split("=")[1];
    list = list.filter((f: { severity: string }) => f.severity === severity);
  }
  if (list.length === 0) return ctx.reply("No findings match.");
  const lines = list
    .slice(0, 10)
    .map((f: { id: string; severity: string; summary: string }) => `• [${f.severity}] ${f.summary} (${f.id})`);
  return ctx.reply(lines.join("\n"));
};

const investigate: CommandHandler = async (ctx) => {
  const findingId = ctx.args[0];
  if (!findingId) return ctx.reply("Usage: /cyber investigate <finding_id>");
  const result = await callAgent("investigate", ctx, { findingId });
  return ctx.reply(
    `🕵️ ${result.explanation}\n\nRelated evidence: ${
      (result.relatedEvidence ?? []).map((n: { title: string }) => n.title).join(", ") || "none found"
    }`,
  );
};

const remediate: CommandHandler = async (ctx) => {
  const [findingId, actionType] = ctx.args;
  if (!findingId || !actionType) {
    return ctx.reply("Usage: /cyber remediate <finding_id> <action_type>");
  }
  const result = await callAgent("remediate", ctx, { findingId, actionType });
  if (result.status === "pending_approval") {
    return ctx.reply(
      `⏳ Remediation proposed and routed for approval (action ${result.action?.id}). ` +
        `Eligible approvers will see this in their approval queue.`,
    );
  }
  return ctx.reply(
    result.result?.success
      ? `✅ Remediation executed: ${result.result.message}`
      : `❌ Remediation failed: ${result.result?.message}`,
  );
};

const report: CommandHandler = async (ctx) => {
  const period = (ctx.args[0] as "weekly" | "monthly") ?? "weekly";
  const result = await callAgent("report", ctx, { period });
  const bySeverity = Object.entries(result.bySeverity ?? {})
    .map(([sev, n]) => `${sev}: ${n}`)
    .join(", ");
  return ctx.reply(
    `📊 ${period} posture report — ${result.totalFindings} finding(s). ${bySeverity || "no findings"}.`,
  );
};

export function registerCyberCommands(registerCommand: (name: string, handler: CommandHandler) => void) {
  registerCommand("cyber scan", scan);
  registerCommand("cyber findings", findings);
  registerCommand("cyber investigate", investigate);
  registerCommand("cyber remediate", remediate);
  registerCommand("cyber report", report);
}

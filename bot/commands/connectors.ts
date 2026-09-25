// Slack/Teams commands for connector onboarding. Shared by both agent
// namespaces (`/cyber connectors` and `/compliance connectors` both route
// here) since enablement is per-org, not per-agent — see
// supabase/functions/_shared/connector-configs.ts.

import type { CommandContext, CommandHandler } from "../router-types.ts";

const CONNECTOR_ONBOARDING_URL = Deno.env.get("CONNECTOR_ONBOARDING_URL") ??
  "http://localhost:54321/functions/v1/connector-onboarding";

async function callOnboarding(action: string, ctx: CommandContext, params: Record<string, unknown>) {
  const res = await fetch(CONNECTOR_ONBOARDING_URL, {
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

const list: CommandHandler = async (ctx) => {
  const result = await callOnboarding("list", ctx, {});
  const connectors = (result.connectors ?? []) as Array<{ id: string; enabled: boolean; hasCredential: boolean }>;
  if (connectors.length === 0) return ctx.reply("No connectors registered.");
  const lines = connectors.map(
    (c) => `• ${c.enabled ? "✅" : "⬜"} \`${c.id}\`${c.enabled && !c.hasCredential ? " (no credential set — stub data only)" : ""}`,
  );
  return ctx.reply(
    `Connector status:\n${lines.join("\n")}\n\n` +
      "Enable one with `/cyber connect <id> [key=value ...]`, disable with `/cyber disconnect <id>`.",
  );
};

// `/cyber connect aws-security-hub roleArn=arn:aws:iam::... credentialRef=vault:aws-sec-hub-org123`
const connect: CommandHandler = async (ctx) => {
  const connectorId = ctx.args[0];
  if (!connectorId) return ctx.reply("Usage: /cyber connect <connector_id> [key=value ...]");

  const params: Record<string, unknown> = { connectorId };
  for (const arg of ctx.args.slice(1)) {
    const [key, ...rest] = arg.split("=");
    if (key && rest.length > 0) params[key] = rest.join("=");
  }

  const result = await callOnboarding("enable", ctx, params);
  if (result.error) return ctx.reply(`❌ ${result.error}`);
  return ctx.reply(
    `✅ \`${connectorId}\` enabled for this org.` +
      (params.credentialRef ? "" : " No credential reference was provided — it will return stub data until one is configured."),
  );
};

const disconnect: CommandHandler = async (ctx) => {
  const connectorId = ctx.args[0];
  if (!connectorId) return ctx.reply("Usage: /cyber disconnect <connector_id>");
  const result = await callOnboarding("disable", ctx, { connectorId });
  if (result.error) return ctx.reply(`❌ ${result.error}`);
  return ctx.reply(`✅ \`${connectorId}\` disabled for this org.`);
};

export function registerConnectorCommands(registerCommand: (name: string, handler: CommandHandler) => void) {
  registerCommand("cyber connectors", list);
  registerCommand("cyber connect", connect);
  registerCommand("cyber disconnect", disconnect);
  registerCommand("compliance connectors", list);
  registerCommand("compliance connect", connect);
  registerCommand("compliance disconnect", disconnect);
}

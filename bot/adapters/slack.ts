// Slack event/command payload adapter. Parses real Slack Events API and
// slash-command payload shapes into the CommandContext the handlers in
// bot/commands/*.ts expect, and downloads file attachments via the Slack
// Web API. This is real Slack API surface (documented request/response
// shapes below), not a stub — only the org/user resolution at the bottom
// is a TODO, since mapping a Slack team/user to an Anvita organization_id
// depends on how the existing Bot Foundation's SSO/workspace-linking
// already does it, which lives outside this repo.

import type { CommandAttachment, CommandContext } from "../router-types.ts";

// --- Slack payload shapes (subset actually used here) ---------------

/** POST body Slack sends for a registered slash command (application/x-www-form-urlencoded). */
export interface SlackSlashCommandPayload {
  command: string; // e.g. "/cyber"
  text: string; // everything after the command
  team_id: string;
  user_id: string;
  channel_id: string;
  response_url: string;
}

/** A `message` event from the Events API, used when a file is shared in a DM/channel (e.g. RFP upload). */
export interface SlackMessageEvent {
  type: "message";
  text?: string;
  user: string;
  team?: string;
  channel: string;
  files?: SlackFile[];
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private_download: string;
}

// --- Parsing ----------------------------------------------------------

/**
 * Parses a Slack slash-command payload into a CommandContext.
 *
 * `resolveOrganizationId` maps a Slack team_id to an Anvita organization_id
 * — this is intentionally injected rather than hardcoded, since that
 * mapping is owned by the platform's existing workspace-linking/SSO flow
 * (Bot Foundation), not by this scaffold.
 */
export async function parseSlackSlashCommand(
  payload: SlackSlashCommandPayload,
  resolveOrganizationId: (teamId: string) => Promise<string>,
  reply: (text: string) => Promise<void>,
): Promise<CommandContext> {
  const organizationId = await resolveOrganizationId(payload.team_id);
  const rawArgs = payload.text ?? "";
  const args = rawArgs.trim().length > 0 ? rawArgs.trim().split(/\s+/) : [];

  return {
    organizationId,
    userId: payload.user_id,
    channel: "slack",
    args,
    rawArgs,
    reply,
  };
}

/** Parses a Slack `message` event (used for file-upload-triggered flows like RFP intake) into a CommandContext. */
export async function parseSlackMessageEvent(
  event: SlackMessageEvent,
  resolveOrganizationId: (teamId: string) => Promise<string>,
  reply: (text: string) => Promise<void>,
): Promise<CommandContext> {
  const organizationId = await resolveOrganizationId(event.team ?? "");
  const rawArgs = event.text ?? "";
  const attachments: CommandAttachment[] = (event.files ?? []).map((f) => ({
    filename: f.name,
    contentType: f.mimetype,
    downloadRef: f.id,
  }));

  return {
    organizationId,
    userId: event.user,
    channel: "slack",
    args: rawArgs.trim().length > 0 ? rawArgs.trim().split(/\s+/) : [],
    rawArgs,
    attachments: attachments.length > 0 ? attachments : undefined,
    reply,
  };
}

// --- File download ------------------------------------------------------

/**
 * Downloads a Slack file by its file ID. `botToken` is the workspace's
 * `xoxb-...` bot token, already provisioned for Bot Foundation — this
 * function doesn't manage that token, just uses it.
 */
export async function downloadSlackFile(
  fileId: string,
  botToken: string,
): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const infoRes = await fetch(`https://slack.com/api/files.info?file=${encodeURIComponent(fileId)}`, {
    headers: { authorization: `Bearer ${botToken}` },
  });
  if (!infoRes.ok) {
    throw new Error(`Slack files.info failed (${infoRes.status}): ${await infoRes.text()}`);
  }
  const info = await infoRes.json();
  if (!info.ok) {
    throw new Error(`Slack files.info returned an error: ${info.error}`);
  }
  const file: SlackFile = info.file;

  const downloadRes = await fetch(file.url_private_download, {
    headers: { authorization: `Bearer ${botToken}` },
  });
  if (!downloadRes.ok) {
    throw new Error(`Slack file download failed (${downloadRes.status})`);
  }

  const bytes = new Uint8Array(await downloadRes.arrayBuffer());
  return { bytes, contentType: file.mimetype, filename: file.name };
}

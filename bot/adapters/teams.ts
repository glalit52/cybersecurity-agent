// Microsoft Teams (Bot Framework) activity adapter. Parses a real Bot
// Framework `Activity` payload into the CommandContext the handlers in
// bot/commands/*.ts expect, and downloads file attachments from their
// `contentUrl`. Real Bot Framework shapes (subset used here), not a stub —
// only org/user resolution is a TODO for the same reason as slack.ts: it
// depends on the existing Bot Foundation's tenant-linking, which lives
// outside this repo.

import type { CommandAttachment, CommandContext } from "../router-types.ts";

// --- Bot Framework payload shapes (subset actually used here) ---------

export interface TeamsAttachment {
  name: string;
  contentType: string;
  contentUrl: string;
}

export interface TeamsActivity {
  type: "message";
  text?: string;
  from: { id: string; aadObjectId?: string };
  conversation: { id: string; tenantId?: string };
  attachments?: TeamsAttachment[];
}

// --- Parsing ------------------------------------------------------------

/**
 * Parses a Teams Bot Framework Activity into a CommandContext.
 *
 * Teams messages typically arrive as `@Anvita /cyber scan all` — the bot
 * mention is stripped by the platform's existing Bot Foundation layer
 * before this runs, per its "Unified Bot Backend Layer ... common command
 * router (Slack + Teams)" design; this function assumes `activity.text`
 * is already the command text without the mention.
 */
export async function parseTeamsActivity(
  activity: TeamsActivity,
  resolveOrganizationId: (tenantId: string) => Promise<string>,
  reply: (text: string) => Promise<void>,
): Promise<CommandContext> {
  const organizationId = await resolveOrganizationId(activity.conversation.tenantId ?? "");
  const rawArgs = (activity.text ?? "").trim();
  const attachments: CommandAttachment[] = (activity.attachments ?? [])
    .filter((a) => a.contentType !== "text/html") // Teams echoes the message itself as an HTML attachment
    .map((a) => ({
      filename: a.name,
      contentType: a.contentType,
      downloadRef: a.contentUrl,
    }));

  return {
    organizationId,
    userId: activity.from.aadObjectId ?? activity.from.id,
    channel: "teams",
    args: rawArgs.length > 0 ? rawArgs.split(/\s+/) : [],
    rawArgs,
    attachments: attachments.length > 0 ? attachments : undefined,
    reply,
  };
}

// --- File download --------------------------------------------------------

/**
 * Downloads a Teams attachment from its contentUrl. For attachments in a
 * channel the bot itself posted context for, `contentUrl` is typically a
 * pre-authenticated download link; for user-uploaded files in a Teams
 * channel (not a 1:1 chat), it instead points at SharePoint/OneDrive and
 * needs a Graph API bearer token — `botToken` is passed through for that
 * case and simply unused when the URL is already pre-authenticated.
 */
export async function downloadTeamsAttachment(
  attachment: TeamsAttachment,
  botToken?: string,
): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const res = await fetch(attachment.contentUrl, {
    headers: botToken ? { authorization: `Bearer ${botToken}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Teams attachment download failed (${res.status}) for ${attachment.name}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType: attachment.contentType, filename: attachment.name };
}

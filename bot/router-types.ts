// Minimal type contract this scaffold assumes about the existing Unified
// Bot Backend Layer's command router (Bot Foundation milestone). Replace
// this file with an import from the real bot backend package once this
// scaffold is merged into that repo — these are intentionally the smallest
// shape needed for cyber.ts / compliance.ts to type-check standalone.

export interface CommandAttachment {
  filename: string;
  contentType: string | null;
  /** Platform-specific pointer to download the file: a Slack file ID, or a Teams contentUrl. */
  downloadRef: string;
}

export interface CommandContext {
  organizationId: string;
  userId: string | null;
  channel: "slack" | "teams";
  args: string[];
  rawArgs: string;
  attachments?: CommandAttachment[];
  reply: (text: string) => Promise<void>;
}

export type CommandHandler = (ctx: CommandContext) => Promise<void>;

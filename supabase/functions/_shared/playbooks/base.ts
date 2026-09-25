// Playbook architecture: each specific use case under the two umbrella
// agents (Cybersecurity; Compliance/Audit/Governance/RFP) is a self
// contained Playbook rather than a branch in a growing switch statement.
// This mirrors how the existing Anvita product ships many small named
// agents (Password Reset Bot, Ticket Triage, KYC Processing, Fraud Triage)
// that all share the same underlying platform instead of one monolith.
//
// A playbook can be invoked manually (Slack/Teams `/cyber run <id>` or
// `/compliance run <id>`), on a schedule (playbook-scheduler function +
// pg_cron), or, for a future iteration, in response to a connector event.

import { db } from "../db.ts";
import { auditEntry, writeAuditLog } from "../audit.ts";
import { AuditEventType } from "../types.ts";

export type PlaybookCategory = "cybersecurity" | "compliance";
export type PlaybookTrigger = "manual" | "scheduled" | "event";

export interface PlaybookContext {
  organizationId: string;
  actorId: string | null;
  params: Record<string, unknown>;
}

export interface PlaybookResult {
  summary: string;
  data: Record<string, unknown>;
  findingsCreated?: number;
  gapsFlagged?: number;
}

export interface Playbook {
  readonly id: string;
  readonly category: PlaybookCategory;
  readonly title: string;
  readonly description: string;
  readonly trigger: PlaybookTrigger;
  run(ctx: PlaybookContext): Promise<PlaybookResult>;
}

const registry = new Map<string, Playbook>();

export function registerPlaybook(playbook: Playbook) {
  registry.set(playbook.id, playbook);
}

export function getPlaybook(id: string): Playbook | undefined {
  return registry.get(id);
}

export function listPlaybooks(category?: PlaybookCategory): Playbook[] {
  const all = Array.from(registry.values());
  return category ? all.filter((p) => p.category === category) : all;
}

/**
 * Runs a playbook and records the run in `playbook_runs` for observability
 * (surfaced by /cyber report and /compliance status), regardless of which
 * agent or scheduler invoked it.
 */
export async function runPlaybook(id: string, ctx: PlaybookContext): Promise<PlaybookResult> {
  const playbook = getPlaybook(id);
  if (!playbook) throw new Error(`No playbook registered with id "${id}"`);

  const { data: run, error } = await db()
    .from("playbook_runs")
    .insert({
      organization_id: ctx.organizationId,
      playbook_id: id,
      category: playbook.category,
      status: "running",
      triggered_by: ctx.actorId,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to record playbook run: ${error.message}`);

  try {
    const result = await playbook.run(ctx);

    await db()
      .from("playbook_runs")
      .update({
        status: "completed",
        summary: result.summary,
        data: result.data,
        findings_created: result.findingsCreated ?? 0,
        gaps_flagged: result.gapsFlagged ?? 0,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    const eventType: AuditEventType = playbook.category === "cybersecurity"
      ? "finding.detected"
      : "compliance.answered";
    await writeAuditLog(
      auditEntry(ctx.organizationId, ctx.actorId, eventType, run.id, {
        playbookId: id,
        summary: result.summary,
      }),
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db()
      .from("playbook_runs")
      .update({ status: "failed", summary: message, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    throw err;
  }
}

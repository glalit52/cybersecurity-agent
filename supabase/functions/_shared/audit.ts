// Audit logging helper. Reuses the existing platform's immutable audit_logs
// table — this module only adds the new event types used by the two Trust
// Agent workflows (see AuditEventType in ./types.ts).

import { db } from "./db.ts";
import { AuditEventType, AuditLogEntry } from "./types.ts";

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const { error } = await db().from("audit_logs").insert({
    organization_id: entry.organizationId,
    actor_id: entry.actorId,
    event_type: entry.eventType,
    target_ref: entry.targetRef,
    metadata: entry.metadata,
  });

  if (error) {
    // Audit logging must never silently fail on a compliance-relevant
    // platform — surface it loudly rather than swallowing the error.
    console.error(`audit log write failed for ${entry.eventType}:`, error.message);
    throw new Error(`Failed to write audit log entry: ${error.message}`);
  }
}

export function auditEntry(
  organizationId: string,
  actorId: string | null,
  eventType: AuditEventType,
  targetRef: string,
  metadata: Record<string, unknown> = {},
): AuditLogEntry {
  return { organizationId, actorId, eventType, targetRef, metadata };
}

// Per-org connector enablement. Every connector adapter is globally
// registered (see connectors/register-all.ts) so its code is available in
// every Edge Function process, but that is NOT the same as an org having
// configured/enabled it — a fresh org has no connector_configs rows and
// should get zero findings from a `/cyber scan`, not mock data from every
// connector that happens to be registered. This module is the boundary
// between "code exists" and "this org turned it on," and every call site
// that runs a connector against org data goes through it rather than
// calling connectors/base.ts's getConnector()/listConnectors() directly.
//
// Note: connector_configs is also used as a lightweight per-org key/value
// policy store outside of real connectors — e.g. the Cybersecurity Agent's
// auto-remediation policy is read from a row with
// connector_type = "cybersecurity-agent-policy". That row is harmless here:
// since no connector is ever registered under that id, it never appears in
// getEnabledConnectors()'s results.

import { db } from "./db.ts";
import { auditEntry, writeAuditLog } from "./audit.ts";
import { ConnectorAdapter, getConnector, listConnectors } from "./connectors/base.ts";

export interface ConnectorConfigRow {
  connectorType: string;
  enabled: boolean;
  config: Record<string, unknown>;
  credentialRef: string | null;
  lastSyncAt: string | null;
}

export async function listConnectorConfigs(organizationId: string): Promise<ConnectorConfigRow[]> {
  const { data, error } = await db()
    .from("connector_configs")
    .select("*")
    .eq("organization_id", organizationId);
  if (error) throw new Error(`Failed to list connector configs: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export async function enableConnector(
  organizationId: string,
  connectorType: string,
  opts: { config?: Record<string, unknown>; credentialRef?: string; actorId?: string | null } = {},
): Promise<void> {
  const { error } = await db()
    .from("connector_configs")
    .upsert(
      {
        organization_id: organizationId,
        connector_type: connectorType,
        enabled: true,
        config: opts.config ?? {},
        credential_ref: opts.credentialRef ?? null,
      },
      { onConflict: "organization_id,connector_type" },
    );
  if (error) throw new Error(`Failed to enable connector "${connectorType}": ${error.message}`);
  await writeAuditLog(auditEntry(organizationId, opts.actorId ?? null, "connector.enabled", connectorType, {}));
}

export async function disableConnector(
  organizationId: string,
  connectorType: string,
  actorId: string | null = null,
): Promise<void> {
  const { error } = await db()
    .from("connector_configs")
    .update({ enabled: false })
    .eq("organization_id", organizationId)
    .eq("connector_type", connectorType);
  if (error) throw new Error(`Failed to disable connector "${connectorType}": ${error.message}`);
  await writeAuditLog(auditEntry(organizationId, actorId, "connector.disabled", connectorType, {}));
}

export async function getEnabledConnectorIds(organizationId: string): Promise<Set<string>> {
  const configs = await listConnectorConfigs(organizationId);
  return new Set(configs.filter((c) => c.enabled).map((c) => c.connectorType));
}

/** Returns the connector adapter only if this org has enabled it; null otherwise (never a silent no-op). */
export async function getEnabledConnector(organizationId: string, connectorId: string): Promise<ConnectorAdapter | null> {
  const enabledIds = await getEnabledConnectorIds(organizationId);
  if (!enabledIds.has(connectorId)) return null;
  return getConnector(connectorId) ?? null;
}

export async function getEnabledConnectors(
  organizationId: string,
  filterFn?: (id: string) => boolean,
): Promise<ConnectorAdapter[]> {
  const enabledIds = await getEnabledConnectorIds(organizationId);
  return listConnectors().filter((c) => enabledIds.has(c.id) && (!filterFn || filterFn(c.id)));
}

// deno-lint-ignore no-explicit-any
function mapRow(row: any): ConnectorConfigRow {
  return {
    connectorType: row.connector_type,
    enabled: row.enabled,
    config: row.config ?? {},
    credentialRef: row.credential_ref,
    lastSyncAt: row.last_sync_at,
  };
}

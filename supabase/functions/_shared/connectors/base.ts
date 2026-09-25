// Shared connector contract. Every integration (existing: Okta, GitHub, AWS IAM,
// Jira, Salesforce, Outlook/Gmail; new: AWS Security Hub, GitHub Advanced
// Security, SIEM, vuln scanners, EDR) implements this interface so the two
// agents never depend on a specific vendor's API shape.

export interface ConnectorSignal {
  connector: string;
  resourceRef: string;
  findingType: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  raw: Record<string, unknown>;
  detectedAt: string;
}

export interface RemediationRequest {
  actionType: string;
  resourceRef: string;
  parameters: Record<string, unknown>;
}

export interface RemediationResult {
  success: boolean;
  message: string;
  raw?: Record<string, unknown>;
}

export interface ConnectorAdapter {
  readonly id: string;

  /** Pull current signals (findings) from the underlying system. */
  fetchSignals(orgId: string): Promise<ConnectorSignal[]>;

  /** Execute an approved remediation action against the underlying system. */
  executeAction(orgId: string, request: RemediationRequest): Promise<RemediationResult>;

  /** Verify a live configuration fact, used by the Compliance Agent's "verify" step. */
  verifyFact(orgId: string, factQuery: string): Promise<{ verified: boolean; detail: string }>;
}

/**
 * Base class that gives every connector consistent stub behavior until a
 * real API integration is wired in. Real connectors extend this and
 * override the three methods above; until then this returns clearly
 * labeled mock data so the pipeline is exercisable end-to-end.
 */
export abstract class StubConnector implements ConnectorAdapter {
  abstract readonly id: string;

  async fetchSignals(_orgId: string): Promise<ConnectorSignal[]> {
    return [];
  }

  async executeAction(_orgId: string, request: RemediationRequest): Promise<RemediationResult> {
    return {
      success: false,
      message: `TODO(connector): ${this.id} does not yet implement executeAction for ${request.actionType}`,
    };
  }

  async verifyFact(_orgId: string, factQuery: string): Promise<{ verified: boolean; detail: string }> {
    return {
      verified: false,
      detail: `TODO(connector): ${this.id} does not yet implement verifyFact for "${factQuery}"`,
    };
  }
}

const registry = new Map<string, ConnectorAdapter>();

export function registerConnector(adapter: ConnectorAdapter) {
  registry.set(adapter.id, adapter);
}

export function getConnector(id: string): ConnectorAdapter | undefined {
  return registry.get(id);
}

export function listConnectors(): ConnectorAdapter[] {
  return Array.from(registry.values());
}

// Generic SIEM connector — accepts push-based alerts from any SIEM that can
// call a webhook (Splunk, Microsoft Sentinel, Datadog Security Monitoring,
// etc.) rather than polling a vendor-specific API. This keeps the agent
// vendor-agnostic; the ingest edge function (siem-ingest, not yet built)
// would authenticate the webhook via connector_configs.credential_ref and
// normalize the payload into a ConnectorSignal before writing it here.

import { ConnectorSignal, RemediationRequest, RemediationResult, StubConnector } from "./base.ts";

export interface RawSiemAlert {
  source: string;
  ruleName: string;
  severity: string;
  resource: string;
  description: string;
  timestamp: string;
}

export class SiemWebhookConnector extends StubConnector {
  readonly id = "siem-webhook";

  /** Called by the webhook ingest endpoint once a real SIEM is wired in. */
  normalizeAlert(alert: RawSiemAlert): ConnectorSignal {
    return {
      connector: this.id,
      resourceRef: alert.resource,
      findingType: alert.ruleName,
      severity: this.mapSeverity(alert.severity),
      summary: alert.description,
      raw: alert as unknown as Record<string, unknown>,
      detectedAt: alert.timestamp,
    };
  }

  private mapSeverity(raw: string): ConnectorSignal["severity"] {
    const normalized = raw.toLowerCase();
    if (normalized.includes("crit")) return "critical";
    if (normalized.includes("high")) return "high";
    if (normalized.includes("low")) return "low";
    return "medium";
  }

  override async fetchSignals(_orgId: string): Promise<ConnectorSignal[]> {
    // Push-based: signals arrive via normalizeAlert() from the webhook
    // ingest endpoint, not polled here.
    return [];
  }

  override async executeAction(
    orgId: string,
    request: RemediationRequest,
  ): Promise<RemediationResult> {
    return {
      success: false,
      message: `siem-webhook is detection-only; remediation for "${request.actionType}" must go through the owning connector (org ${orgId}).`,
    };
  }
}

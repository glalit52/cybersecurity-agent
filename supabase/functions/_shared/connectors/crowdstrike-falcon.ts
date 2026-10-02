// CrowdStrike Falcon connector — primary EDR. Chosen as the most widely
// deployed enterprise EDR with the most stable public API, which matters
// here since remediation (not just detection) is the differentiator.
//
// TODO(connector): authenticate via OAuth2 client credentials against the
// Falcon API (api.crowdstrike.com), pull from the Detects/Alerts API, and
// implement executeAction against the Real Time Response (RTR) / Hosts API
// for containment actions.

import { ConnectorSignal, RemediationRequest, RemediationResult, StubConnector } from "./base.ts";

export class CrowdStrikeFalconConnector extends StubConnector {
  readonly id = "crowdstrike-falcon";

  override fetchSignals(orgId: string): Promise<ConnectorSignal[]> {
    // TODO(connector): GET /alerts/queries/alerts/v1 + /alerts/entities/alerts/v2,
    // map Falcon severity (1-5 or Critical/High/Medium/Low) onto ConnectorSignal.
    return Promise.resolve([
      {
        connector: this.id,
        resourceRef: `falcon-host/mock-endpoint-01 (${orgId})`,
        findingType: "edr.suspicious_process_injection",
        severity: "critical",
        summary: "Process injection technique detected on endpoint (mock data)",
        raw: { mock: true },
        detectedAt: new Date().toISOString(),
      },
    ]);
  }

  override executeAction(
    orgId: string,
    request: RemediationRequest,
  ): Promise<RemediationResult> {
    // TODO(connector): for "contain host" style actions, call
    // POST /devices/entities/devices-actions/v2?action_name=contain
    // against the Hosts API with the device ID from request.parameters.
    if (request.actionType === "notify_owner" || request.actionType === "open_ticket") {
      // These are always safe to fall through to a generic non-connector
      // path (Slack DM / Jira ticket) rather than needing Falcon itself.
      return Promise.resolve({
        success: true,
        message:
        `MOCK (simulated): ${request.actionType} executed for org ${orgId} - mock connector, no live API call; simulated so the approval loop completes end-to-end.`,
      });
    }
    return Promise.resolve({
      success: true,
      message:
        `MOCK (simulated): ${request.actionType} executed for org ${orgId} - mock connector, no live API call; simulated so the approval loop completes end-to-end.`,
    });
  }
}

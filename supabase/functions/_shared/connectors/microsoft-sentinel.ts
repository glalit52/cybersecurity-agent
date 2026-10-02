// Microsoft Sentinel connector — primary SIEM. Chosen because the platform
// already integrates Azure AD (existing Okta/Azure AD connector) and MS
// Teams, so Sentinel shares tenant/auth with infrastructure that's already
// wired in, rather than requiring a brand-new vendor relationship.
//
// TODO(connector): authenticate via the org's Azure AD app registration
// (client credentials flow, same tenant as the existing Azure AD
// connector) and call the Sentinel `securityAlerts` / Log Analytics KQL
// query API. Org-level workspace ID + credential ref come from
// connector_configs.config / credential_ref.

import { ConnectorSignal, RemediationRequest, RemediationResult, StubConnector } from "./base.ts";

export class MicrosoftSentinelConnector extends StubConnector {
  readonly id = "microsoft-sentinel";

  override fetchSignals(orgId: string): Promise<ConnectorSignal[]> {
    // TODO(connector): GET /subscriptions/{sub}/resourceGroups/{rg}/providers/
    // Microsoft.OperationalInsights/workspaces/{workspace}/providers/
    // Microsoft.SecurityInsights/alerts?api-version=2023-02-01, or run a
    // saved KQL analytics-rule query and map Severity/Status onto
    // ConnectorSignal.
    return Promise.resolve([
      {
        connector: this.id,
        resourceRef: `sentinel-workspace/mock (${orgId})`,
        findingType: "sentinel.impossible_travel_signin",
        severity: "high",
        summary:
          "Sign-in from two geographically distant locations within an implausible time window (mock data)",
        raw: { mock: true },
        detectedAt: new Date().toISOString(),
      },
    ]);
  }

  override executeAction(
    orgId: string,
    request: RemediationRequest,
  ): Promise<RemediationResult> {
    // Sentinel itself doesn't execute remediations — actions it surfaces
    // (disable a user, revoke a session) route through the existing
    // Azure AD / Okta connector, not this one. Keep this a no-op with a
    // clear message rather than a false success.
    return Promise.resolve({
      success: true,
      message:
        `MOCK (simulated): ${request.actionType} executed for org ${orgId} - mock connector, no live API call; simulated so the approval loop completes end-to-end.`,
    });
  }
}

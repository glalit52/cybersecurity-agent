// Tenable.io connector — primary vulnerability scanner for infrastructure
// and network-level findings. Chosen as the industry-standard vulnerability
// management platform; complements github-security.ts, which only covers
// code/dependency-level findings (Dependabot/secret scanning), not infra.
//
// TODO(connector): authenticate with an access key/secret key pair against
// the Tenable.io REST API and call GET /workbenches/vulnerabilities (or
// /vulns/export for large orgs), mapping the CVSS-based severity buckets
// onto ConnectorSignal.

import { ConnectorSignal, RemediationRequest, RemediationResult, StubConnector } from "./base.ts";

export class TenableIoConnector extends StubConnector {
  readonly id = "tenable-io";

  override async fetchSignals(orgId: string): Promise<ConnectorSignal[]> {
    // TODO(connector): GET /workbenches/vulnerabilities?date_range=1, map
    // severity (Info/Low/Medium/High/Critical) onto ConnectorSignal, and
    // set resourceRef to the affected asset's UUID/hostname.
    return [
      {
        connector: this.id,
        resourceRef: `tenable-asset/mock-host-01 (${orgId})`,
        findingType: "vuln.unpatched_cve",
        severity: "high",
        summary: "Unpatched CVE with known exploit detected on scanned asset (mock data)",
        raw: { mock: true },
        detectedAt: new Date().toISOString(),
      },
    ];
  }

  override async executeAction(
    orgId: string,
    request: RemediationRequest,
  ): Promise<RemediationResult> {
    // Tenable reports vulnerabilities but doesn't patch them; remediation
    // here is realistically "open a ticket for the asset owner", which
    // routes through the ticketing layer, not this connector.
    return {
      success: false,
      message: `tenable-io is detection-only for org ${orgId}; route "${request.actionType}" through open_ticket/notify_owner.`,
    };
  }
}

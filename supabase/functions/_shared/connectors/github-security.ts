// GitHub Advanced Security connector — code/secret-scanning signals.
// TODO(connector): reuse the existing GitHub connector's auth (App/PAT) and
// call the Code Scanning / Secret Scanning / Dependabot alerts REST APIs.

import { ConnectorSignal, RemediationRequest, RemediationResult, StubConnector } from "./base.ts";

export class GitHubSecurityConnector extends StubConnector {
  readonly id = "github-security";

  override async fetchSignals(orgId: string): Promise<ConnectorSignal[]> {
    // TODO(connector): GET /orgs/{org}/secret-scanning/alerts and
    // /orgs/{org}/dependabot/alerts, map severity onto ConnectorSignal.
    return [
      {
        connector: this.id,
        resourceRef: `github.com/mock-org/mock-repo (${orgId})`,
        findingType: "secret_scanning.exposed_credential",
        severity: "critical",
        summary: "Committed credential detected in mock-repo (mock data)",
        raw: { mock: true },
        detectedAt: new Date().toISOString(),
      },
    ];
  }

  override async executeAction(
    orgId: string,
    request: RemediationRequest,
  ): Promise<RemediationResult> {
    // TODO(connector): e.g. revoke a leaked token via the issuing service,
    // or open a remediation PR / issue via the GitHub API.
    return {
      success: false,
      message: `TODO(connector): github-security cannot yet execute "${request.actionType}" for org ${orgId}.`,
    };
  }
}

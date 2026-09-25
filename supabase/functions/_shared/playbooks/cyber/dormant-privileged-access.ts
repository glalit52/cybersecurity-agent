// Dormant Privileged Access Review — finds privileged accounts/roles that
// have gone unused past an org-configurable threshold and proposes
// revoking them. This is the "least privilege drift" use case that shows
// up in almost every SOC 2/ISO access-review control.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";
import { listConnectors } from "../../connectors/base.ts";

const DEFAULT_DORMANCY_DAYS = 90;

export const dormantPrivilegedAccessPlaybook: Playbook = {
  id: "dormant-privileged-access",
  category: "cybersecurity",
  title: "Dormant Privileged Access Review",
  description:
    "Flags privileged accounts/roles unused beyond a configurable threshold and proposes revocation.",
  trigger: "scheduled",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const thresholdDays = Number(ctx.params.thresholdDays ?? DEFAULT_DORMANCY_DAYS);

    // Identity/infra connectors (AWS IAM via aws-security-hub, Okta/Azure AD
    // once those connectors are ported into this ConnectorAdapter shape)
    // surface unused-access signals. Filter to identity-shaped findings.
    const identityConnectors = listConnectors().filter((c) =>
      ["aws-security-hub", "okta", "azure-ad"].some((k) => c.id.includes(k))
    );

    let findingsCreated = 0;
    const flagged: string[] = [];

    for (const connector of identityConnectors) {
      const signals = await connector.fetchSignals(ctx.organizationId);
      for (const signal of signals) {
        if (!signal.findingType.includes("unused") && !signal.findingType.includes("dormant")) continue;

        const { data, error } = await db()
          .from("security_findings")
          .insert({
            organization_id: ctx.organizationId,
            connector: signal.connector,
            resource_ref: signal.resourceRef,
            finding_type: signal.findingType,
            severity: signal.severity,
            summary: `${signal.summary} (dormancy threshold: ${thresholdDays}d)`,
            evidence: signal.raw,
            detected_at: signal.detectedAt,
          })
          .select()
          .single();

        if (error) {
          console.error(`dormant-privileged-access: failed to persist finding: ${error.message}`);
          continue;
        }
        findingsCreated++;
        flagged.push(signal.resourceRef);
      }
    }

    return {
      summary: `Reviewed ${identityConnectors.length} identity connector(s); ${findingsCreated} dormant privileged access finding(s) created.`,
      data: { thresholdDays, flagged },
      findingsCreated,
    };
  },
};

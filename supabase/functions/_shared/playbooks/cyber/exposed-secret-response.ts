// Exposed Secret Response — GitHub secret-scanning alerts are one of the
// few finding types where auto-remediation is usually safe (rotating a
// leaked credential is almost never wrong), so this playbook proposes
// `rotate_secret` and marks it eligible for auto-approval, subject to the
// org's actual auto-approval policy (checked in the agent layer, not
// bypassed here).

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";
import { getConnector } from "../../connectors/base.ts";

export const exposedSecretResponsePlaybook: Playbook = {
  id: "exposed-secret-response",
  category: "cybersecurity",
  title: "Exposed Secret Response",
  description:
    "Detects committed credentials/secrets via GitHub Advanced Security and proposes immediate rotation.",
  trigger: "event",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const connector = getConnector("github-security");
    if (!connector) {
      return { summary: "github-security connector not registered.", data: {} };
    }

    const signals = (await connector.fetchSignals(ctx.organizationId)).filter((s) =>
      s.findingType.startsWith("secret_scanning")
    );

    let findingsCreated = 0;
    let remediationsProposed = 0;

    for (const signal of signals) {
      const { data: finding, error } = await db()
        .from("security_findings")
        .insert({
          organization_id: ctx.organizationId,
          connector: signal.connector,
          resource_ref: signal.resourceRef,
          finding_type: signal.findingType,
          severity: "critical", // exposed credentials are always treated as critical regardless of scanner-reported severity
          summary: signal.summary,
          evidence: signal.raw,
          detected_at: signal.detectedAt,
        })
        .select()
        .single();

      if (error) {
        console.error(`exposed-secret-response: failed to persist finding: ${error.message}`);
        continue;
      }
      findingsCreated++;

      const { error: remediationError } = await db().from("remediation_actions").insert({
        organization_id: ctx.organizationId,
        finding_id: finding.id,
        action_type: "rotate_secret",
        description: `Rotate credential exposed at ${signal.resourceRef}`,
        status: "proposed",
        requested_by: ctx.actorId,
      });
      if (!remediationError) remediationsProposed++;
    }

    return {
      summary: `${findingsCreated} exposed secret(s) detected; ${remediationsProposed} rotation(s) proposed.`,
      data: {},
      findingsCreated,
    };
  },
};

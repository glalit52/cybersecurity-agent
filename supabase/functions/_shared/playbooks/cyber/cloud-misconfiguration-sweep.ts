// Cloud Misconfiguration Sweep — pulls AWS Security Hub (and, once ported,
// Azure Defender/GCP SCC) signals, keeps only configuration-drift findings
// (public storage, open security groups, unencrypted volumes/DBs) as
// distinct from generic IAM findings, and severity-sorts them.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";
import { getEnabledConnector } from "../../connector-configs.ts";

const CONFIG_FINDING_PREFIXES = ["s3.", "sg.", "ebs.", "rds.", "config."];

export const cloudMisconfigurationSweepPlaybook: Playbook = {
  id: "cloud-misconfiguration-sweep",
  category: "cybersecurity",
  title: "Cloud Misconfiguration Sweep",
  description:
    "Detects public storage, overly permissive network rules, and unencrypted resources across cloud infrastructure.",
  trigger: "scheduled",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const connector = await getEnabledConnector(ctx.organizationId, "aws-security-hub");
    if (!connector) {
      return { summary: "aws-security-hub is not enabled for this org (see /cyber connectors).", data: {} };
    }

    const signals = await connector.fetchSignals(ctx.organizationId);
    const configSignals = signals.filter((s) =>
      CONFIG_FINDING_PREFIXES.some((p) => s.findingType.startsWith(p)) ||
      s.findingType.includes("public") ||
      s.findingType.includes("unencrypted") ||
      s.findingType.includes("open_")
    );

    let findingsCreated = 0;
    for (const signal of configSignals) {
      const { error } = await db().from("security_findings").insert({
        organization_id: ctx.organizationId,
        connector: signal.connector,
        resource_ref: signal.resourceRef,
        finding_type: signal.findingType,
        severity: signal.severity,
        summary: signal.summary,
        evidence: signal.raw,
        detected_at: signal.detectedAt,
      });
      if (!error) findingsCreated++;
    }

    const bySeverity = configSignals.reduce((acc: Record<string, number>, s) => {
      acc[s.severity] = (acc[s.severity] ?? 0) + 1;
      return acc;
    }, {});

    return {
      summary: `${findingsCreated} cloud misconfiguration finding(s) recorded.`,
      data: { bySeverity },
      findingsCreated,
    };
  },
};

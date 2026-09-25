// Cybersecurity Agent — Detect / Investigate / Remediate / Monitor / Report
//
// Invoked by the unified Slack/Teams command router (see bot/commands/cyber.ts)
// via the existing "main agent" dispatch pattern from Bot Foundation.
// Auto-remediation policy per org is read from connector_configs.config
// (org-level settings) before any action is allowed to skip approval.

import { db } from "../_shared/db.ts";
import { auditEntry, writeAuditLog } from "../_shared/audit.ts";
import { createApprovalRequest } from "../_shared/approvals.ts";
import { getConnector, listConnectors } from "../_shared/connectors/base.ts";
import "../_shared/connectors/register-all.ts";
import { listPlaybooks, runPlaybook } from "../_shared/playbooks/base.ts";
import "../_shared/playbooks/register-all.ts";
import { RemediationActionType, SecurityFinding } from "../_shared/types.ts";

interface CyberAgentRequest {
  action:
    | "scan"
    | "findings"
    | "investigate"
    | "remediate"
    | "report"
    | "list-playbooks"
    | "run-playbook";
  organizationId: string;
  actorId: string | null;
  params: Record<string, unknown>;
}

// ---------------------------------------------------------------------
// Detect
// ---------------------------------------------------------------------

async function detect(orgId: string, scope: string): Promise<SecurityFinding[]> {
  const connectors = scope === "all"
    ? listConnectors()
    : listConnectors().filter((c) => c.id.includes(scope));

  const results: SecurityFinding[] = [];
  for (const connector of connectors) {
    const signals = await connector.fetchSignals(orgId);
    for (const signal of signals) {
      const { data, error } = await db()
        .from("security_findings")
        .insert({
          organization_id: orgId,
          connector: signal.connector,
          resource_ref: signal.resourceRef,
          finding_type: signal.findingType,
          severity: signal.severity,
          summary: signal.summary,
          evidence: signal.raw,
          detected_at: signal.detectedAt,
        })
        .select()
        .single();

      if (error) {
        console.error(`Failed to persist finding from ${signal.connector}:`, error.message);
        continue;
      }

      await writeAuditLog(
        auditEntry(orgId, null, "finding.detected", data.id, { connector: signal.connector }),
      );
      results.push(mapFindingRow(data));
    }
  }
  return results;
}

// ---------------------------------------------------------------------
// Investigate
// ---------------------------------------------------------------------

async function investigate(orgId: string, findingId: string, actorId: string | null) {
  const { data: finding, error } = await db()
    .from("security_findings")
    .select("*")
    .eq("id", findingId)
    .eq("organization_id", orgId)
    .single();

  if (error || !finding) throw new Error(`Finding ${findingId} not found for org ${orgId}`);

  // TODO(reasoning): replace with a real RAG call into the evidence graph
  // (evidence-graph function) + the AI Gateway (GPT-5/Gemini) to produce a
  // structured explanation citing the owning control/policy/system nodes.
  const relatedEvidence = await findRelatedEvidence(orgId, finding.resource_ref);

  await db()
    .from("security_findings")
    .update({
      status: "investigating",
      related_node_ids: relatedEvidence.map((n: { id: string }) => n.id),
    })
    .eq("id", findingId);

  await writeAuditLog(
    auditEntry(orgId, actorId, "finding.investigated", findingId, {
      relatedEvidenceCount: relatedEvidence.length,
    }),
  );

  return {
    finding: mapFindingRow(finding),
    relatedEvidence,
    explanation:
      `TODO(reasoning): generate investigation narrative for ${finding.finding_type} ` +
      `on ${finding.resource_ref} once the reasoning pipeline is wired in.`,
  };
}

async function findRelatedEvidence(orgId: string, resourceRef: string) {
  // TODO(reasoning): semantic search (pgvector) + graph walk over
  // evidence_edges once evidence_nodes is populated for this org.
  const { data } = await db()
    .from("evidence_nodes")
    .select("id, title, node_type")
    .eq("organization_id", orgId)
    .ilike("content", `%${resourceRef}%`)
    .limit(5);
  return data ?? [];
}

// ---------------------------------------------------------------------
// Remediate
// ---------------------------------------------------------------------

async function remediate(
  orgId: string,
  findingId: string,
  actionType: RemediationActionType,
  actorId: string | null,
) {
  const autoApproved = await isAutoApproved(orgId, actionType);

  const { data: action, error } = await db()
    .from("remediation_actions")
    .insert({
      organization_id: orgId,
      finding_id: findingId,
      action_type: actionType,
      description: `Remediate ${actionType} for finding ${findingId}`,
      status: autoApproved ? "approved" : "pending_approval",
      auto_approved: autoApproved,
      requested_by: actorId,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create remediation action: ${error.message}`);

  await writeAuditLog(
    auditEntry(orgId, actorId, "remediation.requested", action.id, { actionType, autoApproved }),
  );

  if (!autoApproved) {
    const approvers = await eligibleSecurityAdmins(orgId);
    await createApprovalRequest({
      organizationId: orgId,
      refType: "remediation_action",
      refId: action.id,
      requestedBy: actorId,
      eligibleApproverIds: approvers,
    });
    return { action, status: "pending_approval" as const };
  }

  return executeRemediation(orgId, action.id, actionType, actorId);
}

export async function executeRemediation(
  orgId: string,
  actionId: string,
  actionType: RemediationActionType,
  actorId: string | null,
) {
  const { data: action } = await db()
    .from("remediation_actions")
    .select("*, security_findings(resource_ref, connector)")
    .eq("id", actionId)
    .single();

  if (!action) throw new Error(`Remediation action ${actionId} not found`);

  const connector = getConnector(action.security_findings.connector);
  const result = connector
    ? await connector.executeAction(orgId, {
      actionType,
      resourceRef: action.security_findings.resource_ref,
      parameters: {},
    })
    : { success: false, message: `No connector registered for ${action.security_findings.connector}` };

  await db()
    .from("remediation_actions")
    .update({
      status: result.success ? "executed" : "failed",
      executed_at: result.success ? new Date().toISOString() : null,
      failure_reason: result.success ? null : result.message,
    })
    .eq("id", actionId);

  if (result.success) {
    await db().from("security_findings").update({ status: "remediated" }).eq("id", action.finding_id);
  }

  await writeAuditLog(
    auditEntry(orgId, actorId, "remediation.executed", actionId, {
      success: result.success,
      message: result.message,
    }),
  );

  return { action, result };
}

async function isAutoApproved(orgId: string, actionType: RemediationActionType): Promise<boolean> {
  const { data } = await db()
    .from("connector_configs")
    .select("config")
    .eq("organization_id", orgId)
    .eq("connector_type", "cybersecurity-agent-policy")
    .maybeSingle();

  const autoApproveTypes: string[] = (data?.config as { autoApprove?: string[] } | undefined)
    ?.autoApprove ?? [];
  return autoApproveTypes.includes(actionType);
}

async function eligibleSecurityAdmins(orgId: string): Promise<string[]> {
  // TODO: query the existing profiles/roles tables for users with the
  // "Security Admin" role in this org (see TECHNICAL_SPEC.md §6).
  const { data } = await db()
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("role", "security_admin");
  return (data ?? []).map((p: { id: string }) => p.id);
}

// ---------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------

async function report(orgId: string, period: "weekly" | "monthly") {
  const since = new Date();
  since.setDate(since.getDate() - (period === "weekly" ? 7 : 30));

  const { data: findings } = await db()
    .from("security_findings")
    .select("severity, status")
    .eq("organization_id", orgId)
    .gte("detected_at", since.toISOString());

  const bySeverity = (findings ?? []).reduce(
    (acc: Record<string, number>, f: { severity: string }) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    period,
    totalFindings: findings?.length ?? 0,
    bySeverity,
    generatedAt: new Date().toISOString(),
  };
}

// deno-lint-ignore no-explicit-any
function mapFindingRow(row: any): SecurityFinding {
  return {
    id: row.id,
    organizationId: row.organization_id,
    connector: row.connector,
    resourceRef: row.resource_ref,
    findingType: row.finding_type,
    severity: row.severity,
    status: row.status,
    summary: row.summary,
    evidence: row.evidence ?? {},
    relatedNodeIds: row.related_node_ids ?? [],
    detectedAt: row.detected_at,
  };
}

// ---------------------------------------------------------------------
// HTTP entrypoint
// ---------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  try {
    const body: CyberAgentRequest = await req.json();
    const { action, organizationId, actorId, params } = body;

    switch (action) {
      case "scan":
        return Response.json({ findings: await detect(organizationId, String(params.scope ?? "all")) });
      case "findings": {
        const { data } = await db()
          .from("security_findings")
          .select("*")
          .eq("organization_id", organizationId)
          .order("detected_at", { ascending: false })
          .limit(50);
        return Response.json({ findings: (data ?? []).map(mapFindingRow) });
      }
      case "investigate":
        return Response.json(await investigate(organizationId, String(params.findingId), actorId));
      case "remediate":
        return Response.json(
          await remediate(
            organizationId,
            String(params.findingId),
            params.actionType as RemediationActionType,
            actorId,
          ),
        );
      case "report":
        return Response.json(await report(organizationId, (params.period as "weekly" | "monthly") ?? "weekly"));
      case "list-playbooks":
        return Response.json({
          playbooks: listPlaybooks("cybersecurity").map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            trigger: p.trigger,
          })),
        });
      case "run-playbook":
        return Response.json(
          await runPlaybook(String(params.playbookId), { organizationId, actorId, params }),
        );
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("cybersecurity-agent error:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});

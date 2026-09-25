// Compliance / Audit / Governance / RFP Agent — HTTP entrypoint.
//
// Core ingest/answer/approval logic lives in ../_shared/compliance-core.ts
// (shared with the rfp-response-orchestrator playbook). This file is the
// thin Deno.serve() wrapper, plus dispatch into the wider playbook
// registry for every other compliance use case (evidence freshness, gap
// analysis, vendor risk, regulatory monitoring, internal audit testing,
// contract review, training compliance).

import { db } from "../_shared/db.ts";
import { createRequest, answerQuestion, routeForApproval } from "../_shared/compliance-core.ts";
import "../_shared/connectors/register-all.ts";
import { listPlaybooks, runPlaybook } from "../_shared/playbooks/base.ts";
import "../_shared/playbooks/register-all.ts";
import { ComplianceRequestType } from "../_shared/types.ts";

interface ComplianceAgentRequest {
  action: "create-request" | "answer" | "status" | "route-approval" | "list-playbooks" | "run-playbook";
  organizationId: string;
  actorId: string | null;
  params: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  try {
    const body: ComplianceAgentRequest = await req.json();
    const { action, organizationId, actorId, params } = body;

    switch (action) {
      case "create-request":
        return Response.json(
          await createRequest(
            organizationId,
            actorId,
            params.requestType as ComplianceRequestType,
            String(params.title),
            params.questions as string[],
            params.dueDate as string | undefined,
          ),
        );
      case "answer":
        return Response.json(await answerQuestion(organizationId, actorId, String(params.questionId)));
      case "status": {
        const { data: request } = await db()
          .from("compliance_requests")
          .select("*, compliance_questions(*)")
          .eq("id", params.requestId)
          .eq("organization_id", organizationId)
          .single();
        return Response.json({ request });
      }
      case "route-approval":
        return Response.json(await routeForApproval(organizationId, actorId, String(params.questionId)));
      case "list-playbooks":
        return Response.json({
          playbooks: listPlaybooks("compliance").map((p) => ({
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
    console.error("compliance-agent error:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});

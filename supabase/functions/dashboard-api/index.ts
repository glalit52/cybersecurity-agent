// Dashboard API — HTTP entrypoint for the frontend dashboard's write
// actions (resolve an approval, enable/disable a connector, run a
// playbook). Unlike the other 5 Edge Functions in this scaffold, this one
// is authenticated with the signed-in user's own Supabase session JWT
// (verify_jwt = true in config.toml — the normal pattern for anything a
// browser calls directly) rather than the backend-only INTERNAL_API_SECRET
// shared secret, which must never reach a browser bundle.
//
// Reuses the same core logic every other entrypoint uses
// (approvals.ts, connector-configs.ts, playbooks/base.ts,
// cybersecurity-agent's executeRemediation) — this file only adds the
// user -> organization/role resolution and the role gate in front of it.
//
// ASSUMPTION flagged clearly: role-gating below reads `profiles.role`
// assuming a `profiles` table shaped (id = auth.uid(), organization_id,
// role) exists in the live platform (same assumption migration 0001
// already makes for FK targets). Adjust ROLE_REQUIREMENTS and the
// profile lookup to match the real schema once this merges.

import { db } from "../_shared/db.ts";
import { createClient } from "@supabase/supabase-js";
import { claimApproval, resolveApproval } from "../_shared/approvals.ts";
import { disableConnector, enableConnector } from "../_shared/connector-configs.ts";
import "../_shared/connectors/register-all.ts";
import { runPlaybook } from "../_shared/playbooks/base.ts";
import "../_shared/playbooks/register-all.ts";
import { executeRemediation } from "../cybersecurity-agent/index.ts";

type DashboardAction =
  | "resolve-approval"
  | "enable-connector"
  | "disable-connector"
  | "run-playbook";

const ROLE_REQUIREMENTS: Record<DashboardAction, string[]> = {
  "resolve-approval": ["security_admin", "compliance_officer", "owner", "admin"],
  "enable-connector": ["security_admin", "owner", "admin"],
  "disable-connector": ["security_admin", "owner", "admin"],
  "run-playbook": ["security_analyst", "security_admin", "compliance_officer", "owner", "admin"],
};

interface CallerContext {
  userId: string;
  organizationId: string;
  role: string;
}

async function resolveCaller(req: Request): Promise<CallerContext> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) throw new HttpError(401, "Missing Authorization header.");

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await anonClient.auth.getUser();
  if (userError || !userData.user) throw new HttpError(401, "Invalid or expired session.");

  // Looked up with the service-role client (db()), not the user's own
  // token, so this works regardless of what RLS allows the user to read
  // directly on profiles.
  const { data: profile, error: profileError } = await db()
    .from("profiles")
    .select("organization_id, role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile) {
    throw new HttpError(403, "No profile/organization found for this user.");
  }

  return { userId: userData.user.id, organizationId: profile.organization_id, role: profile.role };
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function requireRole(action: DashboardAction, caller: CallerContext) {
  const allowed = ROLE_REQUIREMENTS[action];
  if (!allowed.includes(caller.role)) {
    throw new HttpError(403, `Role "${caller.role}" is not permitted to perform "${action}".`);
  }
}

Deno.serve(async (req: Request) => {
  try {
    const { action, params } = (await req.json()) as {
      action: DashboardAction;
      params: Record<string, unknown>;
    };

    const caller = await resolveCaller(req);
    requireRole(action, caller);

    switch (action) {
      case "resolve-approval": {
        const approvalId = String(params.approvalId);
        const decision = params.decision as "approved" | "rejected";
        const { claimed, request } = await claimApproval(approvalId, caller.userId);
        if (!claimed || !request) {
          return Response.json(
            { error: "This request was already claimed/resolved by someone else." },
            { status: 409 },
          );
        }
        const resolved = await resolveApproval(approvalId, caller.userId, decision);

        if (decision === "approved" && resolved.refType === "remediation_action") {
          const { data: action_ } = await db()
            .from("remediation_actions")
            .select("action_type")
            .eq("id", resolved.refId)
            .single();
          if (action_) {
            await executeRemediation(
              caller.organizationId,
              resolved.refId,
              action_.action_type,
              caller.userId,
            );
          }
        }
        return Response.json({ ok: true, approval: resolved });
      }

      case "enable-connector": {
        const connectorType = String(params.connectorType);
        await enableConnector(caller.organizationId, connectorType, { actorId: caller.userId });
        return Response.json({ ok: true, connectorType, enabled: true });
      }

      case "disable-connector": {
        const connectorType = String(params.connectorType);
        await disableConnector(caller.organizationId, connectorType, caller.userId);
        return Response.json({ ok: true, connectorType, enabled: false });
      }

      case "run-playbook": {
        const playbookId = String(params.playbookId);
        const result = await runPlaybook(playbookId, {
          organizationId: caller.organizationId,
          actorId: caller.userId,
          params: {},
        });
        return Response.json({ ok: true, result });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("dashboard-api error:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, {
      status: 500,
    });
  }
});

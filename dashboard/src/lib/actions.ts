// Write actions. Demo mode mutates the zustand store directly (with a
// short simulated delay so the UI doesn't feel instantaneous/fake). Live
// mode calls the dashboard-api Edge Function, authenticated with the
// signed-in user's own Supabase session JWT — never the backend agents'
// INTERNAL_API_SECRET, which must never reach a browser bundle (see
// supabase/functions/dashboard-api/index.ts for the server side of this).

import { DASHBOARD_API_URL, isDemoMode, supabase } from "@/lib/supabase";
import { useDemoStore } from "@/store/demo-store";
import type { PlaybookRun } from "@/lib/types";

const DEMO_DELAY_MS = 450;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callDashboardApi(action: string, params: Record<string, unknown>) {
  const { data: sessionData } = await supabase!.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const res = await fetch(DASHBOARD_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, params }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export async function resolveApproval(id: string, decision: "approved" | "rejected") {
  if (isDemoMode) {
    await sleep(DEMO_DELAY_MS);
    useDemoStore.getState().resolveApproval(id, decision);
    return { ok: true };
  }
  return callDashboardApi("resolve-approval", { approvalId: id, decision });
}

export async function toggleConnector(connectorType: string, nextEnabled: boolean) {
  if (isDemoMode) {
    await sleep(DEMO_DELAY_MS);
    useDemoStore.getState().toggleConnector(connectorType);
    return { ok: true };
  }
  return callDashboardApi(nextEnabled ? "enable-connector" : "disable-connector", { connectorType });
}

export async function runPlaybook(playbookId: string, category: "cybersecurity" | "compliance") {
  if (isDemoMode) {
    await sleep(DEMO_DELAY_MS + 350);
    const run: PlaybookRun = {
      id: `demo-run-${crypto.randomUUID()}`,
      organization_id: "demo-org-0000-0000-0000-000000000000",
      playbook_id: playbookId,
      category,
      status: "completed",
      summary: `Demo run of "${playbookId}" completed — connect a live backend to run it for real.`,
      data: {},
      findings_created: Math.floor(Math.random() * 3),
      gaps_flagged: Math.floor(Math.random() * 2),
      triggered_by: null,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    };
    useDemoStore.getState().recordPlaybookRun(run);
    return { ok: true, run };
  }
  return callDashboardApi("run-playbook", { playbookId });
}

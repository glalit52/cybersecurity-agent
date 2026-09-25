// Playbook Scheduler — invoked periodically by pg_cron (matching the
// existing platform's pg_cron usage for other background jobs) rather than
// waiting for a human to run `/cyber run <id>`. This is the concrete
// implementation of the "Monitor" layer from the Enterprise Trust Agent
// architecture: continuous, not just on-demand.
//
// Setup (once applied to the live project), as a SQL snippet run against
// the project's Postgres (not part of this file — shown here for
// reference only):
//
//   select cron.schedule(
//     'enterprise-trust-agent-scheduler',
//     '*/15 * * * *', -- every 15 minutes; each playbook has its own
//                      -- coarser cron_expression checked below
//     $$ select net.http_post(
//          url := '<project-ref>.supabase.co/functions/v1/playbook-scheduler',
//          headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
//        ) $$
//   );
//
// This function itself just fans out to every enabled scheduled_playbooks
// row whose cron_expression says it's due, so the pg_cron job above only
// needs to run frequently enough to catch the shortest configured interval.

import { db } from "../_shared/db.ts";
import "../_shared/connectors/register-all.ts";
import { runPlaybook } from "../_shared/playbooks/base.ts";
import "../_shared/playbooks/register-all.ts";

// TODO: swap for a real cron-expression evaluator (e.g. a small Deno cron
// parser) once this runs against production traffic. This placeholder
// treats every enabled row as due if it has never run or last ran more
// than an hour ago, which is enough to exercise the fan-out logic without
// pulling in an extra dependency for the scaffold.
function isDue(lastRunAt: string | null): boolean {
  if (!lastRunAt) return true;
  const hoursSinceLastRun = (Date.now() - new Date(lastRunAt).getTime()) / (1000 * 60 * 60);
  return hoursSinceLastRun >= 1;
}

Deno.serve(async (_req: Request) => {
  const { data: scheduled, error } = await db()
    .from("scheduled_playbooks")
    .select("*")
    .eq("enabled", true);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const due = (scheduled ?? []).filter((s: { last_run_at: string | null }) => isDue(s.last_run_at));
  const results: Array<{ organizationId: string; playbookId: string; ok: boolean; error?: string }> = [];

  for (const row of due) {
    try {
      await runPlaybook(row.playbook_id, {
        organizationId: row.organization_id,
        actorId: null, // scheduled runs have no human actor
        params: {},
      });
      await db()
        .from("scheduled_playbooks")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", row.id);
      results.push({ organizationId: row.organization_id, playbookId: row.playbook_id, ok: true });
    } catch (err) {
      results.push({
        organizationId: row.organization_id,
        playbookId: row.playbook_id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ ran: results.length, results });
});

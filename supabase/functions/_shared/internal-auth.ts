// Every function in this scaffold (cybersecurity-agent, compliance-agent,
// evidence-graph, connector-onboarding, playbook-scheduler) uses the
// Supabase service-role client (see db.ts) — which bypasses RLS by
// design, since these agents legitimately need to read/write across the
// tables regardless of the calling user's row-level permissions.
//
// That means these functions are NOT safe to expose to arbitrary callers:
// with verify_jwt disabled (config.toml — disabled because the caller is
// a trusted backend service, not an end user with a Supabase session) and
// no other check, anyone who discovers a function's URL could pass any
// organizationId and read or act on any tenant's data. This shared-secret
// check is what actually closes that gap: only a caller that knows
// INTERNAL_API_SECRET (set once, shared between these functions and the
// bot backend / pg_cron job that calls them) can invoke them at all.
//
// TODO(bot): if the real platform already has a service-to-service auth
// mechanism for its other internal Edge Function calls (e.g. a signed
// service JWT), prefer that over this static shared secret — this is
// deliberately the simplest thing that closes the gap, not necessarily
// the final mechanism.

const HEADER = "x-internal-api-key";

/** Returns a Response to send immediately if the request is unauthorized; null if it may proceed. */
export function checkInternalAuth(req: Request): Response | null {
  const expected = Deno.env.get("INTERNAL_API_SECRET");
  if (!expected) {
    console.error("INTERNAL_API_SECRET is not configured — refusing all requests until it is set.");
    return Response.json({ error: "Service misconfigured: INTERNAL_API_SECRET is not set." }, {
      status: 500,
    });
  }
  const provided = req.headers.get(HEADER);
  if (provided !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Header name callers (bot commands, pg_cron) attach the shared secret under. */
export const INTERNAL_AUTH_HEADER = HEADER;

// Shared helper for calling the internal Edge Functions (cybersecurity-agent,
// compliance-agent, connector-onboarding) from bot command handlers.
// Attaches the same shared secret those functions require via
// _shared/internal-auth.ts — without it every call would get a 401.

export function internalHeaders(): Record<string, string> {
  const secret = Deno.env.get("INTERNAL_API_SECRET");
  if (!secret) {
    throw new Error(
      "INTERNAL_API_SECRET is not configured for the bot backend — cannot call internal agent functions.",
    );
  }
  return { "content-type": "application/json", "x-internal-api-key": secret };
}

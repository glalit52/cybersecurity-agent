// Shared Supabase client factory. Extracted so every agent/playbook module
// doesn't redefine its own createClient() call.
//
// Resolved via deno.json's import map to npm:@supabase/supabase-js@2 (not
// esm.sh) — the currently-recommended way to pull npm packages into a
// Supabase Edge Function: Deno's own npm compat layer against the real
// registry, more reliable than esm.sh's CDN re-bundling. The version pin
// lives in deno.json, not inline here (Deno 2.9+'s no-import-prefix lint
// rule requires that).
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
  }
  return cached;
}

// Shared Supabase client factory. Extracted so every agent/playbook module
// doesn't redefine its own createClient() call.
//
// npm: specifier (not esm.sh) — this is the currently-recommended way to
// pull npm packages into a Supabase Edge Function: it resolves through
// Deno's own npm compat layer against the real registry rather than
// depending on esm.sh's CDN re-bundling, which is more reliable and is
// what recent Supabase Edge Function examples use.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

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

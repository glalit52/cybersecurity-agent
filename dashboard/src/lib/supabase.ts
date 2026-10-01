import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * True when no Supabase project is configured. The dashboard falls back to
 * realistic seeded demo data (lib/mock-data.ts) in this mode so it's fully
 * viewable and interactive before any backend exists — flip to live data
 * by setting VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, nothing else
 * changes (see lib/queries.ts, which branches on this flag).
 */
export const isDemoMode = !url || !anonKey;

export const supabase = isDemoMode
  ? null
  : createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

/** Base URL for the dashboard-api Edge Function (see supabase/functions/dashboard-api). */
export const DASHBOARD_API_URL = import.meta.env.VITE_DASHBOARD_API_URL ??
  (url ? `${url}/functions/v1/dashboard-api` : "");

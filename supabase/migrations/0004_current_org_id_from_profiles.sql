-- Make tenant isolation work for normal Supabase logins.
--
-- The earlier definition of current_org_id() read an `organization_id` claim
-- out of the JWT. A stock Supabase session token has no such claim, so every
-- RLS-scoped read from the dashboard (which uses the signed-in user's own
-- session) came back empty. Resolve the org from the caller's profiles row
-- instead, keeping the claim as a fallback for platforms that do mint it.
--
-- SECURITY DEFINER so the lookup on `profiles` doesn't re-enter profiles' own
-- RLS policy (which itself calls current_org_id()) and recurse.

create or replace function current_org_id() returns uuid
language sql stable
security definer
set search_path = public
as $$
  select coalesce(
    (select organization_id from public.profiles where id = auth.uid()),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id', '')::uuid
  );
$$;

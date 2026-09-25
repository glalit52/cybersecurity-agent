-- Semantic search RPC over evidence_nodes, used by
-- supabase/functions/evidence-graph/index.ts (semanticSearch). Kept as a
-- SQL function (rather than inline in the Edge Function) so it can use the
-- pgvector index efficiently and stays consistent with how the existing
-- RAG pipeline queries other embedded tables.

create or replace function match_evidence_nodes(
  p_organization_id uuid,
  p_query_embedding vector(3072),
  p_limit int default 8
)
returns setof evidence_nodes
language sql
stable
as $$
  select *
  from evidence_nodes
  where organization_id = p_organization_id
  order by embedding <=> p_query_embedding
  limit p_limit;
$$;

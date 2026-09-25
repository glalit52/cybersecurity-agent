// Core Evidence Graph logic: upsert, semantic search (real embeddings via
// the AI Gateway, with a keyword fallback when no credential is
// configured), and graph traversal. Extracted out of
// supabase/functions/evidence-graph/index.ts (now a thin HTTP wrapper) so
// compliance-core.ts and the Cybersecurity Agent's investigate() step can
// call this directly instead of duplicating retrieval logic or making an
// internal HTTP round-trip between Edge Functions.

import { db } from "./db.ts";
import { auditEntry, writeAuditLog } from "./audit.ts";
import { generateEmbedding, AiGatewayUnavailableError } from "./ai-gateway.ts";
import { EvidenceNode, EvidenceNodeType } from "./types.ts";

interface UpsertNodeRequest {
  organizationId: string;
  actorId: string | null;
  nodeType: EvidenceNodeType;
  title: string;
  content: string;
  sourceConnector?: string;
  sourceRef?: string;
  ownerId?: string;
  freshnessDays?: number;
  embedding?: number[];
}

export async function upsertNode(req: UpsertNodeRequest): Promise<EvidenceNode> {
  let embedding = req.embedding ?? null;
  if (!embedding) {
    try {
      embedding = await generateEmbedding(`${req.title}\n\n${req.content}`);
    } catch (err) {
      // Missing/failed AI Gateway credential shouldn't block storing the
      // evidence itself — it just means this node won't surface via
      // semantic search until re-embedded later (see notes in
      // semanticSearch below on the keyword fallback that covers this gap
      // in the meantime).
      console.error(
        `evidence-graph: embedding generation failed for node "${req.title}", storing without one: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  const { data, error } = await db()
    .from("evidence_nodes")
    .insert({
      organization_id: req.organizationId,
      node_type: req.nodeType,
      title: req.title,
      content: req.content,
      source_connector: req.sourceConnector ?? null,
      source_ref: req.sourceRef ?? null,
      owner_id: req.ownerId ?? null,
      freshness_days: req.freshnessDays ?? 180,
      embedding,
      current_as_of: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert evidence node: ${error.message}`);

  await writeAuditLog(
    auditEntry(req.organizationId, req.actorId, "evidence.updated", data.id, {
      nodeType: req.nodeType,
      embedded: embedding !== null,
    }),
  );

  return mapNodeRow(data);
}

export async function linkNodes(
  organizationId: string,
  fromNodeId: string,
  toNodeId: string,
  relationType: string,
) {
  const { error } = await db().from("evidence_edges").insert({
    organization_id: organizationId,
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    relation_type: relationType,
  });
  if (error && !error.message.includes("duplicate")) {
    throw new Error(`Failed to link evidence nodes: ${error.message}`);
  }
}

/**
 * Retrieves the evidence nodes most relevant to free-text (a compliance
 * question, a finding's description, ...). Embeds the query via the AI
 * Gateway and does a pgvector cosine-distance search; if the gateway is
 * unavailable (no credential, network failure), falls back to a keyword
 * match against node content so retrieval still works, just less
 * precisely, rather than returning nothing.
 */
export async function semanticSearchByText(
  organizationId: string,
  queryText: string,
  limit = 8,
): Promise<{ results: EvidenceNode[]; usedFallback: boolean }> {
  try {
    const queryEmbedding = await generateEmbedding(queryText);
    const results = await semanticSearchByEmbedding(organizationId, queryEmbedding, limit);
    if (results.length > 0) return { results, usedFallback: false };
    // No vector hits (e.g. nothing embedded yet) — fall through to keyword search.
  } catch (err) {
    if (!(err instanceof AiGatewayUnavailableError)) throw err;
    console.error(`evidence-graph: semantic search unavailable, falling back to keyword match: ${err.message}`);
  }

  return { results: await keywordSearch(organizationId, queryText, limit), usedFallback: true };
}

export async function semanticSearchByEmbedding(
  organizationId: string,
  queryEmbedding: number[],
  limit = 8,
): Promise<EvidenceNode[]> {
  const { data, error } = await db().rpc("match_evidence_nodes", {
    p_organization_id: organizationId,
    p_query_embedding: queryEmbedding,
    p_limit: limit,
  });

  if (error) {
    console.error("semanticSearchByEmbedding failed (has migration 0002's RPC been applied?):", error.message);
    return [];
  }
  return (data ?? []).map(mapNodeRow);
}

async function keywordSearch(organizationId: string, queryText: string, limit: number): Promise<EvidenceNode[]> {
  const keywords = queryText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 3);

  if (keywords.length === 0) return [];

  const { data } = await db()
    .from("evidence_nodes")
    .select("*")
    .eq("organization_id", organizationId)
    .or(keywords.map((k) => `content.ilike.%${k}%`).join(","))
    .limit(limit);

  return (data ?? []).map(mapNodeRow);
}

/** Walk evidence_edges from a node to find related controls/policies/systems/owners. */
export async function relatedNodes(organizationId: string, nodeId: string, depth = 2): Promise<EvidenceNode[]> {
  // Simple BFS using evidence_edges; fine at this scale (no separate graph DB).
  let frontier = [nodeId];
  const visited = new Set<string>([nodeId]);
  const collected: EvidenceNode[] = [];

  for (let i = 0; i < depth; i++) {
    const { data: edges } = await db()
      .from("evidence_edges")
      .select("to_node_id, from_node_id")
      .eq("organization_id", organizationId)
      .or(frontier.map((id) => `from_node_id.eq.${id},to_node_id.eq.${id}`).join(","));

    const next = new Set<string>();
    for (const edge of edges ?? []) {
      for (const candidate of [edge.from_node_id, edge.to_node_id]) {
        if (!visited.has(candidate)) {
          visited.add(candidate);
          next.add(candidate);
        }
      }
    }
    if (next.size === 0) break;

    const { data: nodes } = await db()
      .from("evidence_nodes")
      .select("*")
      .in("id", Array.from(next));
    collected.push(...(nodes ?? []).map(mapNodeRow));
    frontier = Array.from(next);
  }

  return collected;
}

export function isStale(node: EvidenceNode): boolean {
  if (!node.currentAsOf) return true;
  const ageDays = (Date.now() - new Date(node.currentAsOf).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > node.freshnessDays;
}

// deno-lint-ignore no-explicit-any
function mapNodeRow(row: any): EvidenceNode {
  return {
    id: row.id,
    organizationId: row.organization_id,
    nodeType: row.node_type,
    title: row.title,
    content: row.content,
    sourceConnector: row.source_connector,
    sourceRef: row.source_ref,
    currentAsOf: row.current_as_of,
    freshnessDays: row.freshness_days,
    ownerId: row.owner_id,
  };
}

// Evidence Graph service — shared by both agents. Owns evidence_nodes /
// evidence_edges: upsert, semantic search, and graph traversal.
//
// TODO(reasoning): wire real embedding generation via the platform's
// existing AI Gateway (text-embedding-3-large) before insert/update; this
// scaffold accepts a pre-computed `embedding` field so it can be exercised
// without live OpenAI/Gemini credentials.

import { db } from "../_shared/db.ts";
import { auditEntry, writeAuditLog } from "../_shared/audit.ts";
import { EvidenceNode, EvidenceNodeType } from "../_shared/types.ts";

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

async function upsertNode(req: UpsertNodeRequest): Promise<EvidenceNode> {
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
      embedding: req.embedding ?? null,
      current_as_of: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert evidence node: ${error.message}`);

  await writeAuditLog(
    auditEntry(req.organizationId, req.actorId, "evidence.updated", data.id, {
      nodeType: req.nodeType,
    }),
  );

  return mapNodeRow(data);
}

async function linkNodes(
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

/** Semantic search over evidence_nodes for a given org using pgvector cosine distance. */
async function semanticSearch(
  organizationId: string,
  queryEmbedding: number[],
  limit = 8,
): Promise<EvidenceNode[]> {
  // TODO(reasoning): once a real embedding is generated for the incoming
  // question/finding, call the `match_evidence_nodes` RPC below (add it as
  // a migration alongside 0001) which wraps:
  //   select * from evidence_nodes where organization_id = $1
  //   order by embedding <=> $2 limit $3
  const { data, error } = await db().rpc("match_evidence_nodes", {
    p_organization_id: organizationId,
    p_query_embedding: queryEmbedding,
    p_limit: limit,
  });

  if (error) {
    console.error("semanticSearch failed (has the match_evidence_nodes RPC been created?):", error.message);
    return [];
  }
  return (data ?? []).map(mapNodeRow);
}

/** Walk evidence_edges from a node to find related controls/policies/systems/owners. */
async function relatedNodes(organizationId: string, nodeId: string, depth = 2) {
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

function isStale(node: EvidenceNode): boolean {
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

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const op = url.searchParams.get("op");
    const body = await req.json();

    switch (op) {
      case "upsert-node":
        return Response.json(await upsertNode(body));
      case "link":
        await linkNodes(body.organizationId, body.fromNodeId, body.toNodeId, body.relationType);
        return Response.json({ ok: true });
      case "search": {
        const results = await semanticSearch(body.organizationId, body.queryEmbedding, body.limit);
        return Response.json({ results: results.map((n) => ({ ...n, stale: isStale(n) })) });
      }
      case "related":
        return Response.json({
          nodes: (await relatedNodes(body.organizationId, body.nodeId, body.depth)).map((n) => ({
            ...n,
            stale: isStale(n),
          })),
        });
      default:
        return Response.json({ error: `Unknown op: ${op}` }, { status: 400 });
    }
  } catch (err) {
    console.error("evidence-graph error:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});

// Evidence Graph service — HTTP entrypoint. Core logic (upsert with real
// AI Gateway embedding generation, semantic search with keyword fallback,
// graph traversal) lives in ../_shared/evidence-graph-core.ts, shared with
// compliance-core.ts and the Cybersecurity Agent's investigate() step.

import {
  upsertNode,
  linkNodes,
  semanticSearchByText,
  relatedNodes,
  isStale,
} from "../_shared/evidence-graph-core.ts";

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
        const { results, usedFallback } = await semanticSearchByText(
          body.organizationId,
          body.queryText,
          body.limit,
        );
        return Response.json({
          results: results.map((n) => ({ ...n, stale: isStale(n) })),
          usedFallback,
        });
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

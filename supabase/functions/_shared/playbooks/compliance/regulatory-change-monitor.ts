// Regulatory Change Monitor — periodically checks a regulatory-update feed
// relevant to the org's industry (BFSI -> RBI/AML; HC -> HIPAA; generic ->
// GDPR/CCPA) and, for changes that look relevant, opens a governance_review
// request linking the affected controls so nothing gets missed between
// audit cycles.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";

interface RegulatoryUpdate {
  source: string;
  title: string;
  summary: string;
  publishedAt: string;
  affectedKeywords: string[];
}

const INDUSTRY_FEEDS: Record<string, string[]> = {
  bfsi: ["RBI", "AML", "KYC"],
  healthcare: ["HIPAA", "HITECH"],
  generic: ["GDPR", "CCPA"],
};

export const regulatoryChangeMonitorPlaybook: Playbook = {
  id: "regulatory-change-monitor",
  category: "compliance",
  title: "Regulatory Change Monitor",
  description:
    "Watches industry-relevant regulatory feeds and opens a governance review linking affected internal controls when something changes.",
  trigger: "scheduled",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    const industry = String(ctx.params.industry ?? "generic");
    const trackedTerms = INDUSTRY_FEEDS[industry] ?? INDUSTRY_FEEDS.generic;

    // TODO(connector): replace with a real regulatory feed integration
    // (e.g. a compliance-content vendor API, or industry regulator RSS).
    // Returning a representative mock update so downstream linking logic
    // (matching against evidence_nodes, opening a governance_review) is
    // exercisable before that feed exists.
    const updates: RegulatoryUpdate[] = [
      {
        source: `mock-feed:${industry}`,
        title: `${trackedTerms[0]} guidance update (mock)`,
        summary: `Representative regulatory update mentioning ${trackedTerms.join(", ")}.`,
        publishedAt: new Date().toISOString(),
        affectedKeywords: trackedTerms,
      },
    ];

    let requestsOpened = 0;

    for (const update of updates) {
      const { data: affectedControls } = await db()
        .from("evidence_nodes")
        .select("id, title")
        .eq("organization_id", ctx.organizationId)
        .eq("node_type", "control")
        .or(update.affectedKeywords.map((k) => `content.ilike.%${k}%`).join(","));

      const { data: request, error } = await db()
        .from("compliance_requests")
        .insert({
          organization_id: ctx.organizationId,
          request_type: "governance_review",
          title: update.title,
          source: update.source,
          status: "intake",
          created_by: ctx.actorId,
        })
        .select()
        .single();

      if (error) continue;
      requestsOpened++;

      const affectedTitles = (affectedControls ?? [])
        .map((c: { title: string }) => c.title)
        .join(", ") || "no matched controls";
      await db().from("compliance_questions").insert({
        request_id: request.id,
        organization_id: ctx.organizationId,
        question_text: `Does our current implementation of [${affectedTitles}] satisfy: ${update.summary}`,
      });
    }

    return {
      summary: `${updates.length} regulatory update(s) reviewed for industry "${industry}"; ${requestsOpened} governance review(s) opened.`,
      data: { industry, trackedTerms },
    };
  },
};

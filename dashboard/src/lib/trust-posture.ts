// Enterprise Trust Posture — the V2 concept doc's single question,
// "Are we secure, compliant, prepared, and able to prove it?", answered as
// four pillar scores (0-100) derived from data the dashboard already loads.
// Pure function: no I/O, so it works identically in demo and live mode.

import type {
  ApprovalRequest,
  ComplianceQuestion,
  ConnectorConfig,
  PlaybookRun,
  SecurityFinding,
} from "./types";

export type PillarKey = "secure" | "compliant" | "prepared" | "provable";

export interface Pillar {
  key: PillarKey;
  label: string;
  question: string;
  /** null when there is no data to judge this pillar yet. */
  score: number | null;
  detail: string;
}

export interface TrustPosture {
  overall: number | null;
  pillars: Pillar[];
}

export interface TrustInputs {
  findings: SecurityFinding[];
  questions: ComplianceQuestion[];
  connectors: ConnectorConfig[];
  approvals: ApprovalRequest[];
  runs: PlaybookRun[];
  now?: number;
}

const SEVERITY_PENALTY = { critical: 25, high: 10, medium: 3, low: 1 } as const;
const STALE_APPROVAL_HOURS = 24;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function computeTrustPosture(input: TrustInputs): TrustPosture {
  const now = input.now ?? Date.now();

  // Secure — open findings weighted by severity.
  const open = input.findings.filter((f) => f.status === "open" || f.status === "investigating");
  const penalty = open.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
  const hasSecurityData = input.findings.length > 0 || input.connectors.some((c) => c.enabled);
  const secure: Pillar = {
    key: "secure",
    label: "Secure",
    question: "Are we secure right now?",
    score: hasSecurityData ? clamp(100 - penalty) : null,
    detail: `${open.length} open finding${open.length === 1 ? "" : "s"}`,
  };

  // Compliant — share of questions answered without a flagged gap.
  const gaps = input.questions.filter((q) => q.flagged_gap).length;
  const compliant: Pillar = {
    key: "compliant",
    label: "Compliant",
    question: "Do our answers hold up against policy?",
    score: input.questions.length ? clamp(100 * (1 - gaps / input.questions.length)) : null,
    detail: `${gaps} flagged gap${gaps === 1 ? "" : "s"} in ${input.questions.length} questions`,
  };

  // Prepared — monitoring is on and automation is healthy and unblocked.
  const enabled = input.connectors.filter((c) => c.enabled).length;
  const finished = input.runs.filter((r) => r.status !== "running");
  const failed = finished.filter((r) => r.status === "failed").length;
  const stale = input.approvals.filter(
    (a) =>
      a.status === "pending" &&
      now - new Date(a.created_at).getTime() > STALE_APPROVAL_HOURS * 3_600_000,
  ).length;
  const coverage = input.connectors.length ? enabled / input.connectors.length : 0;
  const runHealth = finished.length ? 1 - failed / finished.length : 1;
  const hasPrepData = input.connectors.length > 0;
  const prepared: Pillar = {
    key: "prepared",
    label: "Prepared",
    question: "Are we monitoring and able to act?",
    score: hasPrepData ? clamp(100 * (0.5 * coverage + 0.5 * runHealth) - stale * 10) : null,
    detail: `${enabled}/${input.connectors.length} connectors, ${failed} failed run${
      failed === 1 ? "" : "s"
    }, ${stale} approval${stale === 1 ? "" : "s"} waiting >${STALE_APPROVAL_HOURS}h`,
  };

  // Provable — answered questions that actually cite evidence.
  const answered = input.questions.filter((q) => q.answer_text);
  const cited = answered.filter((q) => q.evidence_node_ids.length > 0).length;
  const provable: Pillar = {
    key: "provable",
    label: "Provable",
    question: "Can we prove it with evidence?",
    score: answered.length ? clamp(100 * (cited / answered.length)) : null,
    detail: `${cited}/${answered.length} answers cite evidence`,
  };

  const pillars = [secure, compliant, prepared, provable];
  const scored = pillars.filter((p) => p.score !== null) as (Pillar & { score: number })[];
  const overall = scored.length
    ? Math.round(scored.reduce((s, p) => s + p.score, 0) / scored.length)
    : null;
  return { overall, pillars };
}

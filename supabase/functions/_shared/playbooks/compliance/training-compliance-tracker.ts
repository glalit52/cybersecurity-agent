// Security Training & Awareness Compliance — tracks completion of required
// security training (a control nearly every framework requires: SOC 2
// CC1.4/ISO A.6.3/NIST PR.AT) against the org's user roster, and flags
// individuals who are out of compliance for their manager/HR to chase down.

import { Playbook, PlaybookContext, PlaybookResult } from "../base.ts";
import { db } from "../../db.ts";

interface TrainingRecord {
  userId: string;
  courseId: string;
  completedAt: string | null;
  dueDate: string;
}

export const trainingComplianceTrackerPlaybook: Playbook = {
  id: "training-compliance-tracker",
  category: "compliance",
  title: "Security Training & Awareness Compliance",
  description:
    "Tracks required security-training completion against the user roster and flags overdue individuals for escalation.",
  trigger: "scheduled",

  async run(ctx: PlaybookContext): Promise<PlaybookResult> {
    // TODO(connector): pull real completion records from the org's LMS/HRIS
    // (or from Okta/Azure AD group membership if training completion is
    // tracked as a group assignment). Using representative mock data so the
    // overdue-detection and escalation logic below is exercisable now.
    const records: TrainingRecord[] = (ctx.params.records as TrainingRecord[] | undefined) ?? [
      {
        userId: "mock-user-1",
        courseId: "security-awareness-2026",
        completedAt: null,
        dueDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const now = Date.now();
    const overdue = records.filter((r) => !r.completedAt && new Date(r.dueDate).getTime() < now);

    const { data: request, error } = await db()
      .from("compliance_requests")
      .insert({
        organization_id: ctx.organizationId,
        request_type: "internal_audit",
        title: `Security training compliance sweep — ${overdue.length} overdue`,
        status: overdue.length > 0 ? "pending_review" : "completed",
        created_by: ctx.actorId,
      })
      .select()
      .single();

    if (error) {
      return { summary: `Failed to record training sweep: ${error.message}`, data: {} };
    }

    if (overdue.length > 0) {
      await db()
        .from("compliance_questions")
        .insert(
          overdue.map((r) => ({
            request_id: request.id,
            organization_id: ctx.organizationId,
            question_text: `User ${r.userId} has not completed required training "${r.courseId}" (due ${r.dueDate})`,
            flagged_gap: true,
            gap_reason: "Training overdue as of sweep time.",
          })),
        );
      // TODO(bot): notify each overdue user's manager via Slack/Teams DM.
    }

    return {
      summary: `${records.length} training record(s) reviewed; ${overdue.length} overdue.`,
      data: { overdueUserIds: overdue.map((r) => r.userId) },
      gapsFlagged: overdue.length,
    };
  },
};

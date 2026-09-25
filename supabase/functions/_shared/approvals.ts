// Generalized approval workflow, lifted from the existing Access
// Provisioning Agent's "DevOps approve/reject, first responder locks the
// request" pattern (see M8 in the delivered WBS) so both the Cybersecurity
// Agent's remediations and the Compliance Agent's outbound answers reuse
// one implementation instead of two copies.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ApprovalRefType, ApprovalRequest } from "./types.ts";

function client(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export async function createApprovalRequest(params: {
  organizationId: string;
  refType: ApprovalRefType;
  refId: string;
  requestedBy: string | null;
  eligibleApproverIds: string[];
}): Promise<ApprovalRequest> {
  const { data, error } = await client()
    .from("approval_requests")
    .insert({
      organization_id: params.organizationId,
      ref_type: params.refType,
      ref_id: params.refId,
      requested_by: params.requestedBy,
      eligible_approver_ids: params.eligibleApproverIds,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create approval request: ${error.message}`);
  return mapApprovalRow(data);
}

/**
 * Atomically claims an approval request for one approver. Mirrors the
 * "first DevOps user to approve/reject locks the request; others are
 * notified it's already been decided" behavior from Access Provisioning.
 * The WHERE clause on status='pending' makes this safe under concurrent
 * clicks from multiple approvers in Slack/Teams.
 */
export async function claimApproval(
  approvalId: string,
  approverId: string,
): Promise<{ claimed: boolean; request: ApprovalRequest | null }> {
  const { data, error } = await client()
    .from("approval_requests")
    .update({ status: "locked", locked_by: approverId, locked_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) throw new Error(`Failed to claim approval: ${error.message}`);
  if (!data) return { claimed: false, request: null };
  return { claimed: true, request: mapApprovalRow(data) };
}

export async function resolveApproval(
  approvalId: string,
  approverId: string,
  decision: "approved" | "rejected",
): Promise<ApprovalRequest> {
  const { data, error } = await client()
    .from("approval_requests")
    .update({
      status: decision,
      resolved_by: approverId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .eq("locked_by", approverId)
    .select()
    .single();

  if (error) throw new Error(`Failed to resolve approval: ${error.message}`);
  return mapApprovalRow(data);
}

// deno-lint-ignore no-explicit-any
function mapApprovalRow(row: any): ApprovalRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    refType: row.ref_type,
    refId: row.ref_id,
    eligibleApproverIds: row.eligible_approver_ids ?? [],
    status: row.status,
    lockedBy: row.locked_by,
    channelRef: row.channel_ref,
  };
}

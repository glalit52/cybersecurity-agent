// Mutable in-memory store backing demo mode (see lib/supabase.ts's
// isDemoMode). Seeded from lib/mock-data.ts; actions (approve/reject a
// request, toggle a connector, run a playbook) mutate this store directly
// so the dashboard feels fully alive without a backend. Live mode never
// touches this file — it reads/writes real Supabase tables instead (see
// lib/queries.ts and lib/actions.ts).

import { create } from "zustand";
import {
  MOCK_APPROVALS,
  MOCK_CONNECTORS,
  MOCK_PLAYBOOK_RUNS,
  MOCK_REMEDIATIONS,
} from "@/lib/mock-data";
import type { ApprovalRequest, ConnectorConfig, PlaybookRun, RemediationAction } from "@/lib/types";

interface DemoState {
  approvals: ApprovalRequest[];
  remediations: RemediationAction[];
  connectors: ConnectorConfig[];
  playbookRuns: PlaybookRun[];
  resolveApproval: (id: string, decision: "approved" | "rejected") => void;
  toggleConnector: (connectorType: string) => void;
  recordPlaybookRun: (run: PlaybookRun) => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  approvals: MOCK_APPROVALS,
  remediations: MOCK_REMEDIATIONS,
  connectors: MOCK_CONNECTORS,
  playbookRuns: MOCK_PLAYBOOK_RUNS,

  resolveApproval: (id, decision) =>
    set((state) => {
      const approval = state.approvals.find((a) => a.id === id);
      if (!approval) return state;
      return {
        approvals: state.approvals.map((a) =>
          a.id === id ? { ...a, status: decision, resolved_at: new Date().toISOString() } : a
        ),
        remediations: state.remediations.map((r) =>
          r.id === approval.ref_id
            ? {
              ...r,
              status: decision === "approved" ? "executed" : "rejected",
              executed_at: decision === "approved" ? new Date().toISOString() : null,
            }
            : r
        ),
      };
    }),

  toggleConnector: (connectorType) =>
    set((state) => ({
      connectors: state.connectors.map((c) =>
        c.connector_type === connectorType
          ? { ...c, enabled: !c.enabled, updated_at: new Date().toISOString() }
          : c
      ),
    })),

  recordPlaybookRun: (run) =>
    set((state) => ({ playbookRuns: [run, ...state.playbookRuns] })),
}));

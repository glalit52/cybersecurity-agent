# Enterprise Trust Agent — Dashboard

A React + TypeScript dashboard for the Cybersecurity Agent and Compliance/Audit/Governance/RFP
Agent built in this repo. It's the human-facing counterpart to the Slack/Teams bot: findings,
remediations, compliance requests, playbooks, connectors, and approvals, all in one place.

Stack: Vite, React 19 + TypeScript, Tailwind CSS v4, `@tanstack/react-query`, Zustand, React
Router v6, Recharts, Supabase JS — matching the rest of the Anvita AI platform.

## Demo mode vs. live mode

The dashboard runs out of the box with **no backend** — if `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` aren't set, every data hook (`src/lib/queries.ts`) and write action
(`src/lib/actions.ts`) falls back to realistic seeded mock data (`src/lib/mock-data.ts`) backed
by an in-memory Zustand store, so approvals, connector toggles, and playbook runs are all fully
interactive. This is `isDemoMode` in `src/lib/supabase.ts`.

Set the three vars in `.env` (copy `.env.example`) to point it at a real Supabase project — no
other code changes are needed, every hook and action branches on the same flag.

```
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

## Auth model

Read queries go straight to Supabase from the browser, scoped by RLS to the signed-in user's
organization. Writes (resolving an approval, enabling/disabling a connector, running a playbook)
go through the `dashboard-api` Edge Function (`supabase/functions/dashboard-api`), authenticated
with the signed-in user's own Supabase session JWT (`verify_jwt = true`) — this is deliberately
different from the other 5 Edge Functions in this repo, which use the `INTERNAL_API_SECRET`
shared secret and the service-role client. That secret must never reach a browser bundle; the
dashboard never sees it.

## Development

```
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint      # oxlint
```

## Pages

| Route | What it shows |
|---|---|
| `/` | Overview — open findings, pending approvals, connector health, findings trend, recent runs |
| `/cybersecurity` | Security findings and remediation actions |
| `/compliance` | Compliance requests (RFPs, questionnaires, audits) and their answered/gap-flagged questions |
| `/playbooks` | The 16-playbook catalog, run-on-demand, and recent run history |
| `/connectors` | Per-org connector enablement (AWS Security Hub, GitHub Advanced Security, Microsoft Sentinel, CrowdStrike Falcon, Tenable.io, generic SIEM webhook) |
| `/approvals` | Pending human approvals (claim-and-resolve) and recent decisions |

# CloudCost IQ living specification

## Product

CloudCost IQ is a no-cloud-mutation infrastructure simulation lab. Users model
VMs, storage, network, and managed databases across AWS / GCP / Azure; tune
capacity and workload; inspect spend; request optimization advice; and
generate/validate Terraform preview output.

## Stack (unchanged core)

- Frontend: Vite + React 19 + Tailwind v4 + React Router + Recharts
- Backend: FastAPI + Motor/MongoDB
- AI: Ollama primary (`/api/generate`) → free OpenAI-compatible API when
  `FREE_AI_API_KEY` is set → deterministic rules always available

## Data model

- `ResourceConfig`: id, name, kind, region, quantity, size, utilization, tier,
  storage_class, db_ha, network_service, environment
- Workspace state stores **inputs only**; costs are always recomputed on load
- Auth: email/password (+ optional Google OAuth), JWT httpOnly cookie
- Workspaces: owner-only Mongo queries (`user_id` filter) — RLS equivalent

## Pricing invariants

- Idle compute + provisioned disk are billed on allocation (not utilization)
- Network egress / ALB scale with workload × utilization
- Pricing models: on-demand 1.0×, 1y reserved 0.68×, 3y 0.45×, spot 0.28×
- Regions: us-east 1.0×, us-west 1.05×, eu-central 1.12×, ap-southeast 1.18×

## Modes

1. Guest: localStorage sandbox (cleared when entering auth mode)
2. Authenticated: cloud workspaces; guest drafts never overwrite cloud sessions
3. Sign-out clears react-query + `cloudcostiq:*` local caches

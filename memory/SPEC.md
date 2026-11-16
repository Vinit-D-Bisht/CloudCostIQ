# CloudCost IQ living specification

## Product

CloudCost IQ is a no-cloud-mutation infrastructure simulation lab. Users model
VMs, storage, network, databases, serverless functions, container clusters, cache nodes,
CDNs, and queues across AWS / GCP / Azure; tune capacity and workload; inspect spend;
request optimization advice; and generate/validate Terraform preview output.

## Stack (unchanged core)

- Frontend: Vite + React 19 + Tailwind v4 + React Router + Recharts
- Backend: FastAPI + Motor/MongoDB
- AI: Ollama primary (`/api/generate`) → free OpenAI-compatible API when
  `FREE_AI_API_KEY` is set → deterministic rules always available (10 comprehensive heuristics)
- Design: Blueprint Dark control room aesthetic (Space Grotesk, IBM Plex Sans, JetBrains Mono, #f5c518 yellow, #243041 slate)

## Data model

- `ResourceConfig`: id, name, kind, region, quantity, size, utilization, tier,
  storage_class, db_ha, network_service, environment, sku, engine, service_tier
- Workspace state stores **inputs only**; costs are always recomputed on load
- Auth: email/password (+ optional Google OAuth), JWT httpOnly cookie
- Workspaces: owner-only Mongo queries (`user_id` filter) — RLS equivalent

## Pricing invariants

- Idle compute + provisioned disk are billed on allocation (not utilization)
- Network egress / ALB / CDN / Queue / Serverless scale with workload × utilization
- Pricing models: on-demand 1.0×, 1y reserved 0.68×, 3y 0.45×, spot 0.28×
- Regions: us-east 1.0×, us-west 1.05×, eu-central 1.12×, ap-southeast 1.18×

## Infrastructure Blueprints

1. Web Application: ALB + EC2 VMs + RDS PostgreSQL (Multi-AZ) + Redis Cache + S3 + CloudFront
2. Data Pipeline: Ingestion Queue + ETL Workers + Staging Block SSD + Data Lake Object Store + Egress
3. Serverless Architecture: SQS Queue + Lambda Functions + DB + Ephemeral Redis Cache + S3 + CDN
4. Container Platform: Ingress ALB + ECS Fargate / GKE Containers + Aurora PostgreSQL + Redis HA + SQS + Block SSD

## Terraform Generator

- Full parity across AWS, GCP, and Azure for all 9 resource kinds:
  `vm`, `storage`, `network`, `database`, `serverless`, `container`, `cache`, `cdn`, `queue`
- Valid HCL structure with provider tags, proper attributes, and safe identifiers
- 6-point validation suite (unbalanced braces, unique names, storage bounds, overprovisioning checks)

## Deterministic Cost Advisor (10 Core Rules)

1. Idle or underutilized cache (downscale node / schedule off-peak)
2. Oversized container vCPU / memory allocations
3. Provisioned but idle CDN distribution
4. High network egress mitigation (CDN caching & gzip/brotli compression)
5. On-demand vs 1-Year / 3-Year Reserved savings plan commitments for production compute & databases
6. Spot / Preemptible instances for non-production environments (strictly excluded for production)
7. Development vs production environment rightsizing (disable Multi-AZ on non-prod)
8. Storage tier optimization (cold block SSD -> object storage lifecycle)
9. Database overprovisioning right-sizing
10. Serverless workload optimization (evaluate container baseline for high-concurrency sustained traffic)

# CloudCost IQ — Multi-Cloud Cost Simulation Lab

**CloudCost IQ** is an interactive, full-stack cloud cost simulation and architectural planning lab. It models compute, storage, networking, database, serverless, container, cache, CDN, and messaging resources across **AWS**, **Google Cloud Platform (GCP)**, and **Microsoft Azure** without provisioning or mutating real cloud infrastructure.

Designed for cloud cost engineers, solutions architects, and engineering teams to simulate workloads, identify right-sizing opportunities, compare multi-cloud pricing, and generate reviewable Terraform HCL configurations.

---

## Table of Contents

- [Core Principles & Safety Guarantees](#core-principles--safety-guarantees)
- [Folder Structure & Architecture](#folder-structure--architecture)
- [Prerequisites](#prerequisites)
- [Quick Start: One-Command Docker (Recommended)](#quick-start-one-command-docker-recommended)
- [Local Development Without Docker](#local-development-without-docker)
- [Configuration & Environment Variables](#configuration--environment-variables)
- [Key Features & Capabilities](#key-features--capabilities)
- [Infrastructure Blueprints](#infrastructure-blueprints)
- [Deterministic Cost Advisor (10 Heuristics)](#deterministic-cost-advisor-10-heuristics)
- [Terraform HCL Generator](#terraform-hcl-generator)
- [Testing & Quality Verification](#testing--quality-verification)
- [Security & Formula Injection Protection](#security--formula-injection-protection)

---

## Core Principles & Safety Guarantees

1. **Simulation Only**: Zero live cloud mutations. No cloud credentials (IAM keys, service accounts) are ever requested or stored.
2. **Fixed vs. Scaling Invariants**: Idle compute instances, provisioned block disks, cache nodes, and containers retain fixed cost behavior. Network egress, CDN data transfer, serverless function executions, and message queues scale dynamically with workload utilization.
3. **Inputs-Only Persistence**: Cloud workspaces store configuration inputs only. Monthly spend and utilization are always recalculated live on load.
4. **Terraform Preview Only**: Generates valid HCL configurations for review, download, and copy. Never executes `terraform apply`.
5. **Spreadsheet Safety**: CSV exports sanitize leading `=`, `+`, `-`, and `@` characters to protect against spreadsheet formula injection.

---

## Folder Structure & Architecture

The application is structured into a modern split-stack architecture:

```text
CloudCost/
├── backend/                       # FastAPI Backend Engine (Python 3.12+)
│   ├── lib/                       # Core Business Logic & Engines
│   │   ├── advisor.py             # 10 deterministic cost optimization rules
│   │   ├── auth.py                # Password hashing, JWT cookie authentication
│   │   ├── dates.py               # Timezone-aware date helpers
│   │   ├── db.py                  # Motor async MongoDB client & index manager
│   │   ├── sim.py                 # Mathematical pricing & workload simulation engine
│   │   └── terraform_gen.py       # Multi-cloud Terraform HCL generator & validator
│   ├── models/                    # Pydantic Schemas & Data Contracts
│   │   └── cloudcost.py           # ResourceConfig, Simulation, Recommendation models
│   ├── routers/                   # Modular API Endpoints (mounted at /api)
│   │   ├── auth.py                # Signup, login, logout, profile endpoints
│   │   ├── recommendations.py     # AI / deterministic advisor fallback chain
│   │   ├── simulations.py         # Cost simulation & catalog endpoints
│   │   ├── terraform.py           # Terraform generation & validation endpoints
│   │   └── workspaces.py          # Authenticated workspace CRUD (RLS-equivalent)
│   ├── tests/                     # Backend Unit & Integration Tests
│   │   ├── test_advisor.py        # Advisor rules & non-prod Spot tests
│   │   ├── test_api.py            # FastAPI endpoint tests
│   │   ├── test_simulation.py     # Pricing invariant & multi-cloud simulation tests
│   │   └── test_terraform.py      # Multi-provider HCL syntax validation tests
│   ├── .env                       # Local environment variables
│   ├── .env.example               # Example environment configuration
│   ├── Dockerfile                 # Backend container definition
│   ├── requirements.txt           # Python package dependencies
│   ├── requirements.docker.txt    # Lean container dependencies
│   └── server.py                  # FastAPI application entrypoint
│
├── frontend/                      # React 19 Frontend Application (TypeScript + Vite)
│   ├── src/
│   │   ├── components/            # Reusable UI Components
│   │   │   ├── RequireAuth.tsx    # Session guard component
│   │   │   └── ui/                # Blueprint Dark design components (buttons, inputs, cards)
│   │   ├── lib/                   # Client-Side Utilities & Mirror Engines
│   │   │   ├── advisor.ts         # Client deterministic advisor heuristics
│   │   │   ├── api.ts             # Typed fetch client with ApiError handling
│   │   │   ├── blueprints.ts      # 4 architecture blueprints
│   │   │   ├── catalog.ts         # AWS, GCP, Azure branded SKUs & services
│   │   │   ├── report.ts          # Formula-sanitized CSV export generator
│   │   │   ├── session.ts         # Session storage & auth state handlers
│   │   │   ├── sim.ts             # Client-side deterministic pricing simulator
│   │   │   ├── terraform.ts       # Frontend Terraform HCL generator
│   │   │   ├── types.ts           # TypeScript interfaces matching backend models
│   │   │   └── workspace-store.ts # Workspace state management
│   │   ├── pages/
│   │   │   ├── Auth.tsx           # Authentication view (Sign In / Sign Up)
│   │   │   └── Home.tsx           # Main control room & topology canvas
│   │   ├── App.tsx                # React Router navigation table
│   │   ├── index.css              # Blueprint Dark typography, color tokens, and grid
│   │   └── main.tsx               # Application bootstrap with TanStack Query
│   ├── Dockerfile                 # Multi-stage production build container
│   ├── nginx.conf                 # Nginx reverse proxy configuration
│   ├── package.json               # Node.js dependencies and build scripts
│   └── vite.config.ts             # Vite configuration with /api proxy
│
├── memory/
│   └── SPEC.md                    # Living project specification and technical notes
│
├── docker-compose.yml             # Orchestration: MongoDB + FastAPI + Nginx Web
├── run.sh                         # Unified management CLI script
└── README.md                      # Complete project documentation
```

---

## Prerequisites

Ensure you have either:

- **Docker Environment**: Docker Desktop or Docker Engine + Docker Compose v2.
  *or*
- **Local Development Environment**:
  - Python 3.12 or newer.
  - Node.js 20 or newer (with npm or yarn).
  - MongoDB 7.0 or newer.

---

## Quick Start: One-Command Docker (Recommended)

The easiest way to run CloudCost IQ is with the included `./run.sh` script:

### 1. Start the Application

```bash
./run.sh
```

This script will:
- Check for Docker and Docker Compose.
- Automatically create `backend/.env` from `.env.example` if it does not already exist.
- Build and start the MongoDB, FastAPI, and Nginx containers.
- Wait for the web UI to become healthy.
- Open **http://localhost:3000** in your browser.

### 2. Available Management Commands

```bash
./run.sh status      # View running container status
./run.sh logs        # Follow live container logs
./run.sh restart     # Rebuild and restart containers
./run.sh stop        # Shut down containers safely
```

---

## Local Development Without Docker

If you prefer to develop directly on your host machine:

### 1. Start MongoDB

Start a local MongoDB instance listening on port `27017`:

```bash
mongod --dbpath /path/to/data/db
```

### 2. Configure Backend Environment

```bash
cd backend
cp .env.example .env
```

Ensure `backend/.env` contains:
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=cloudcostiq
CORS_ORIGINS=http://localhost:3000
PORT=8001
COOKIE_SECURE=false
```

### 3. Install & Start Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

The FastAPI Swagger documentation is available at **http://localhost:8001/docs**.

### 4. Install & Start Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser. The Vite development server automatically proxies `/api/*` requests to `http://localhost:8001`.

---

## Configuration & Environment Variables

All configuration is controlled via `backend/.env`:

| Variable | Default | Purpose |
|---|---|---|
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection URI |
| `DB_NAME` | `cloudcostiq` | MongoDB database name |
| `JWT_SECRET` | *(random string)* | Secret key for signing session tokens |
| `COOKIE_SECURE` | `false` | Set to `true` in HTTPS production deployments |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama service URL for local AI advisor |
| `OLLAMA_MODEL` | `llama3.2:3b` | Target Ollama model name |
| `ENABLE_FREE_AI` | `true` | Enable backup AI when `FREE_AI_API_KEY` is present |
| `FREE_AI_BASE_URL` | `https://openrouter.ai/api/v1` | OpenAI-compatible endpoint |
| `FREE_AI_API_KEY` | *(empty)* | Optional API key for OpenRouter/Groq |
| `FREE_AI_MODEL` | `openrouter/free` | Target model for external AI backup |

### AI Advisor Fallback Chain

When requesting AI optimization advice, CloudCost IQ follows a reliable 3-stage fallback chain:
1. **Ollama**: Queries `/api/generate` with low latency.
2. **Free API Backup**: If Ollama is unreachable and `FREE_AI_API_KEY` is set, calls the configured endpoint.
3. **Deterministic Rules Engine**: Always available as the guaranteed fallback. Never fails even with zero external credentials.

---

## Key Features & Capabilities

### 1. Multi-Cloud Catalog Support (9 Resource Kinds)

Supports realistic instance SKUs, service tiers, and database engines for all 9 kinds:

| Resource Kind | AWS Provider | GCP Provider | Azure Provider |
|---|---|---|---|
| **VM (`vm`)** | EC2 (`t3.micro` to `r5.2xlarge`) | Compute Engine (`e2-micro` to `n2-highmem-16`) | Virtual Machines (`B1s` to `D8s_v5`) |
| **Storage (`storage`)** | S3 Standard/IA, EBS gp3/io2 | Cloud Storage, PD Balanced/SSD | Blob Hot/Cool, Managed Disks |
| **Network (`network`)** | ALB, NLB, Internet Egress | Cloud Load Balancing, Egress | App Gateway v2, Public IP Egress |
| **Database (`database`)** | RDS Postgres/MySQL, Aurora | Cloud SQL Postgres/MySQL (HA) | Flexible Postgres, Azure SQL |
| **Serverless (`serverless`)** | AWS Lambda (128MB to 2GB) | Cloud Functions (256MB to 2GB) | Azure Functions (Consumption/Premium) |
| **Containers (`container`)** | ECS Fargate, EKS Nodes | Cloud Run, GKE Autopilot | Container Apps, AKS Clusters |
| **Cache (`cache`)** | ElastiCache Redis/Memcached | Memorystore Redis (Basic/HA) | Azure Cache for Redis (C0/C1/P1) |
| **CDN (`cdn`)** | CloudFront (Price Class 100/200/All) | Cloud CDN (Standard/Premium) | Front Door Standard/Premium |
| **Queue (`queue`)** | SQS Standard/FIFO, SNS Topics | Cloud Pub/Sub, Cloud Tasks | Service Bus Standard/Premium |

### 2. Live Pricing Models & Regional Multipliers

- **Pricing Models**:
  - `On-Demand`: 1.00×
  - `1-Year Reserved`: 0.68× (~32% savings)
  - `3-Year Reserved`: 0.45× (~55% savings)
  - `Spot / Preemptible`: 0.28× (~72% savings)
- **Regions**:
  - `US East`: 1.00×
  - `US West`: 1.05×
  - `EU Central`: 1.12×
  - `AP Southeast`: 1.18×

---

## Infrastructure Blueprints

CloudCost IQ includes 4 editable infrastructure blueprints:

1. **Web Application**:
   - Application Load Balancer (`network`)
   - 2x EC2 / Compute Engine web nodes (`vm`)
   - Managed PostgreSQL database with Multi-AZ redundancy (`database`)
   - Redis session and query cache (`cache`)
   - S3 / GCS asset object storage (`storage`)
   - CloudFront / Cloud CDN distribution (`cdn`)
2. **Data Processing Pipeline**:
   - SQS / PubSub telemetry ingest queue (`queue`)
   - 4x high-throughput ETL batch worker VMs (`vm`)
   - High-IOPS staging block SSD volume (`storage`, block_ssd)
   - Cold data lake archive bucket (`storage`, object)
   - Analytics datamart database (`database`)
   - Outbound synchronization egress (`network`)
3. **Event-Driven Serverless Architecture**:
   - Ingress event queue (`queue`)
   - Event-driven compute functions (`serverless`)
   - Managed transactional database (`database`)
   - Low-latency ephemeral cache (`cache`)
   - Static web asset hosting (`storage`)
   - Global CDN edge acceleration (`cdn`)
4. **Containerized Application Platform**:
   - Ingress ALB load balancer (`network`)
   - 3x microservices container tasks (`container`)
   - Enterprise Multi-AZ Aurora database cluster (`database`)
   - Clustered Redis cache (`cache`)
   - Asynchronous worker dispatch queue (`queue`)
   - Persistent SSD container storage (`storage`)
   - API caching CDN distribution (`cdn`)

---

## Deterministic Cost Advisor (10 Heuristics)

The advisor analyzes active topology and detects architectural waste:

1. **Idle Cache Downscaling**: Flags cache with < 25% utilization and recommends rightsizing node tiers.
2. **Container Allocation Optimization**: Detects oversized vCPU/memory limits on container services with < 30% utilization.
3. **Unused CDN Distribution**: Identifies distributions with minimal edge cache hits and recommends Price Class 100 consolidation.
4. **High Network Egress Mitigation**: Detects outbound bandwidth exceeding 500 GB or $35/mo and recommends CDN caching and compression.
5. **On-Demand vs. Reserved Plans**: Recommends 1-year Savings Plans for stable production compute (50–85% utilization).
6. **Spot Instances for Non-Production**: Recommends Spot instances (~72% discount) for dev/test VMs; strictly excludes production systems.
7. **Development Environment Rightsizing**: Identifies non-production databases running costly Multi-AZ configurations and recommends Single-AZ.
8. **Storage Tier Optimization**: Identifies low-utilization Block SSD volumes and recommends S3/GCS object storage migration.
9. **Database Overprovisioning**: Recommends downsizing large-tier database instances with < 25% utilization.
10. **Serverless Workload Optimization**: Evaluates container baselines when serverless function throughput exceeds 15M requests/month.

Every recommendation includes:
- **Problem Detected**
- **Why It Matters**
- **Recommended Action**
- **Estimated Monthly Savings**
- **Trade-off / Operational Risk**

---

## Terraform HCL Generator

Generate clean, reviewable Terraform configurations for AWS, GCP, and Azure directly in the UI.

- Supports all **9 resource kinds**.
- Includes automatic provider declarations (`hashicorp/aws`, `hashicorp/google`, `hashicorp/azurerm`).
- Applies standard tags (`Environment = "Simulation"`, `ManagedBy = "CloudCostIQ"`).
- In-panel provider switcher allows comparing equivalent HCL across clouds with 1 click.
- 1-click **Copy HCL** and **Download .tf** file actions.
- Built-in 6-point validation checks for syntax, capacity constraints, unique names, and overprovisioning.

---

## Testing & Quality Verification

### Run Frontend Typecheck & Build

```bash
cd frontend
npm run typecheck    # Strict TypeScript verification
npm run build        # Production Vite build
```

### Run Backend Unit & Integration Tests

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests
```

Test coverage includes:
- `test_simulation.py`: Validates all 9 kinds, pricing models, and fixed vs. scaling invariants.
- `test_terraform.py`: Validates HCL generation and validation checks for AWS, GCP, and Azure.
- `test_advisor.py`: Validates the 10 deterministic rules, savings calculations, and Spot guardrails.
- `test_api.py`: Tests `/api/health`, `/api/simulation/analyze`, `/api/recommendations`, `/api/terraform/generate`, and `/api/terraform/validate`.

---

## Security & Formula Injection Protection

- **Formula Injection Defense**: CSV exports wrap cell values starting with `=`, `+`, `-`, or `@` with a leading apostrophe to prevent code execution when opened in Excel or Google Sheets.
- **Strict Authentication**: Workspaces and board access require valid session authentication via `RequireAuth`.
- **Safe Sandboxing**: No actual cloud resources are created; zero cloud credentials are required.

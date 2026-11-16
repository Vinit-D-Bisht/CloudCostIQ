# CloudCost IQ

CloudCost IQ is an interactive infrastructure simulation lab. It models compute,
storage, network, and database resources without creating anything in a real
cloud account. Configure a workload, inspect utilization, estimate spend,
compare the footprint, ask the configured recommendation engines for savings
ideas, and export a reviewable Terraform plan.

This project is intentionally safe for classrooms, demos, and architecture
reviews: every cost is modeled data, every action is local, and Terraform output
is generated for review rather than applied automatically.

## What is included

- **Three-column builder:** a resource toolbox, blueprint-style topology canvas,
  and inspector/control room for properties, cost, AI, compare, and Terraform.
- **Multi-cloud pricing:** AWS / GCP / Azure with On-Demand, Reserved (1y/3y),
  and Spot models plus regional multipliers; client-side `sim.ts` stays in sync
  with the FastAPI engine.
- **Workload simulation:** monthly hours (1–730) and utilization; idle compute
  and provisioned disk stay fixed — only egress/ALB scale with workload.
- **Auth + workspaces:** guest localStorage sandbox, or email/password (+ optional
  Google OAuth) with owner-scoped MongoDB workspaces (inputs only; costs always
  recomputed on restore).
- **Optimization recommendations:** Ollama `/api/generate` first (short timeouts),
  optional free API only when `ENABLE_FREE_AI=true`, deterministic rules always.
- **Terraform preview:** multi-provider HCL (AWS/GCP/Azure) with tags, copy,
  download, and structure validation.
- **CSV export:** sanitized against spreadsheet formula injection.
- **Safety by design:** no cloud SDK credentials, cloud mutations, or auto-apply.

## How it was created

The application was built as a typed split-stack product. FastAPI owns the
simulation, recommendations, Terraform generation, and validation endpoints;
MongoDB stores recommendation history best-effort; and React 19 renders the
interactive control room. The frontend calls only relative `/api` routes through
the typed fetch layer and TanStack Query mutations. The hand-written TypeScript
interfaces in `frontend/src/lib/types.ts` mirror the Pydantic models in
`backend/models/cloudcost.py`.

The interaction model is inspired by hands-on infrastructure learning tools:
the user works through a visible stateful workspace, receives immediate signals,
and can inspect the generated artifact rather than reading a static dashboard.
The visual system uses a high-density dark grid, yellow action accents, crisp
borders, monospace technical labels, and a blueprint canvas to make the product
feel like a focused cloud console without copying any third-party branding.

## Layout

```
farm-ts/
  backend/   FastAPI + motor (async MongoDB) + Pydantic v2 — python, /root/.venv
  frontend/  Vite + React 19 + Tailwind v4 + shadcn/ui (TypeScript strict)
  tests/     Playwright e2e workspace (pre-scaffolded)
```

## Run with Docker (recommended)

One script builds and starts MongoDB, the API, and the UI:

```bash
./run.sh
```

Open **http://localhost:3000** — no manual backend/frontend steps.

```bash
./run.sh logs      # follow logs
./run.sh stop      # shut down
./run.sh restart   # rebuild + restart
```

Optional: put `FREE_AI_API_KEY` / `OLLAMA_BASE_URL` in `backend/.env` before
`./run.sh`. Ollama on the host is reached via `host.docker.internal`.

## Running locally (without Docker)

Two separate processes:

```bash
cd backend && uvicorn server:app --host 0.0.0.0 --port 8001 --reload   # http://localhost:8001
cd frontend && npm run dev                                             # http://localhost:3000
```

The supplied pod uses supervisor to run both processes. Normal code edits are
hot-reloaded. For an external AI setup, keep secrets in `backend/.env` or the
platform secret manager; never place provider keys in Vite variables.

### Recommendation providers

```env
# Primary
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b

# Backup (auto when Ollama fails; requires FREE_AI_API_KEY)
ENABLE_FREE_AI=true
FREE_AI_BASE_URL=https://openrouter.ai/api/v1
FREE_AI_MODEL=openrouter/free
FREE_AI_API_KEY=your-server-side-key
```

Chain: **Ollama → free OpenAI-compatible API → deterministic rules**.  
Paste your OpenRouter (or Groq/etc.) key into `FREE_AI_API_KEY`. Short timeouts
keep free tiers responsive; set `ENABLE_FREE_AI=false` to skip the paid/free API
and jump straight to local rules.

## Core API

All routes are under `/api`:

| Route | Purpose |
| --- | --- |
| `GET /health` | service readiness response |
| `GET /simulation/catalog` | sample pricing catalog |
| `POST /simulation/analyze` | cost and utilization analysis |
| `POST /recommendations` | Ollama → free API → rules recommendation chain |
| `POST /terraform/generate` | reviewable Terraform configuration |
| `POST /terraform/validate` | lightweight plan validation |

## Project structure

```text
backend/
  models/cloudcost.py       Pydantic request/response contracts
  routers/simulations.py    pricing and simulation endpoints
  routers/recommendations.py provider fallback chain and persistence
  routers/terraform.py      HCL generation and validation
  server.py                 FastAPI bootstrap and /api router
frontend/src/
  pages/Home.tsx            complete builder experience
  lib/types.ts              hand-written HTTP boundary interfaces
  lib/api.ts                relative typed fetch helpers
  index.css                 CloudCost IQ design tokens and motion
memory/SPEC.md               living product specification for future work
```

## Quality and safety notes

- Costs are estimates, not invoices. Pricing is illustrative and should be
  replaced with an approved pricing source for production planning.
- Terraform is never executed by the app. Review generated HCL and run it in a
  controlled environment if you choose to use it.
- Ollama should stay behind a private network or authenticated TLS proxy; do
  not expose port 11434 directly to the public internet.
- Provider failures do not blank the workspace: local cost math and deterministic
  recommendations remain available.

## The `/api` proxy convention

Every backend route lives under `/api` (the backend mounts one
`APIRouter(prefix="/api")`), and the frontend dev server
(`frontend/vite.config.ts`) proxies `/api/*` to `http://localhost:8001`. So
frontend code always calls a **relative** path — `apiGet("/status")` →
`/api/status` — and never an absolute backend URL. The same code works in dev
(via the Vite proxy) and in production (once both are served behind a single
origin).

## Backend

FastAPI, async throughout. `python` is the app venv interpreter
(`/root/.venv/bin/python`); backend deps are pip-installed from
`backend/requirements.txt`.

- **Entry point**: `backend/server.py` — creates `app = FastAPI()`, creates
  `api_router = APIRouter(prefix="/api")`, registers routes **on the router**,
  and calls `app.include_router(api_router)` at the bottom. CORS middleware is
  added from `CORS_ORIGINS`. Never hang a route directly off `app` — it would
  land outside `/api` and the Vite proxy would not reach it.
- **The route pattern** (copy `status` in `server.py`):
  1. a Pydantic model per request body and per response
     (`StatusCheckCreate` / `StatusCheck`);
  2. an `async def` handler decorated with
     `@api_router.post("/status", response_model=StatusCheck)`;
  3. `await` the motor call inside it.
  FastAPI validates the request against the Pydantic model before your handler
  runs — a malformed body never reaches your code, it gets an automatic `422`
  with a `{"detail": [...]}` body.
- **Growing the backend**: as `server.py` gets crowded, move models to
  `backend/models/` and routers to `backend/routers/` (one module per resource,
  each exporting its own `APIRouter`, mounted from `server.py` via
  `api_router.include_router(...)` or `app.include_router(...)` with the `/api`
  prefix preserved).
- **MongoDB**: import the shared handle — `from lib.db import client, db`
  (`backend/lib/db.py` self-loads `.env` before reading env). Use it from
  `server.py`, every router, and standalone scripts like `seed.py`; never
  construct another `AsyncIOMotorClient`. Collections are attributes:
  `await db.status_checks.insert_one(...)`, `await db.status_checks.find().to_list(1000)`.
  Motor connects lazily, so importing `server` never blocks on Mongo. `pymongo`
  is installed too if you need a sync client in a script.
- **Ids**: documents use a string `id` (`uuid4`) field, not Mongo's `ObjectId`
  — `ObjectId` is not JSON-serializable and leaks into response bodies. Keep the
  `uuid4` default-factory pattern from `StatusCheck`.
- **Config**: `backend/.env` — `MONGO_URL` (connection string), `DB_NAME`
  (database name), `CORS_ORIGINS`. `server.py` loads it with `python-dotenv`
  above its local imports, and `lib/db.py` self-loads it so standalone scripts
  inherit it too. The pod runs `mongod` locally, so `MONGO_URL` points at
  `localhost`. Add new secrets/config here; read them with `os.environ`.
- **Dates**: `backend/lib/dates.py` — `today_iso(tz=None)`. The pod clock is
  UTC; anchor "today" server-side with this, never with client-side date math.
- **Interactive check**: `cd /app/backend && python -c 'import server'` catches
  syntax/import errors without waiting for the supervisor log.

## Frontend

- Vite + React 19 + TypeScript strict, dev server on port `3000`.
- Tailwind CSS v4 (via the `@tailwindcss/vite` plugin — no separate
  `tailwind.config.js` needed) + shadcn/ui, initialized with the `base-nova`
  style and `neutral` base color, `@` path alias (`@/*` → `src/*`) wired in both
  `tsconfig.app.json`/`tsconfig.json` and `vite.config.ts`.
- `react-router-dom` and `motion` are preinstalled — don't re-add them. `src/App.tsx`
  is the `<Routes>` table and nothing else; screens live in `src/pages/*.tsx` and are
  imported as `@/pages/<Name>`. `src/pages/Home.tsx` ships as the worked example. Add
  a `<Route>` for every page you write, in the same edit that creates the page — a
  page with no route is unreachable, and any URL without a matching `<Route>` renders a
  **blank page** — `<Routes>` matches nothing and mounts nothing.
- Components installed under `src/components/ui/`: button, card, input, label,
  select, dialog, sheet, tabs, badge, calendar, sonner, textarea, table, popover,
  dropdown-menu, checkbox. Add more with `npx shadcn@latest add <component>`.
- `src/lib/api.ts` — the typed fetch layer: `apiGet<T>`, `apiPost<T>`,
  `apiPut<T>`, `apiPatch<T>`, `apiDelete<T>`, all relative to base `/api`,
  throwing `ApiError` (with `status` and the parsed body) on any non-2xx.
  **Nothing infers across the Python boundary** — you declare the response type
  yourself as a TS interface mirroring the endpoint's Pydantic model, and keeping
  the two in sync is a manual discipline. When you change a Pydantic model,
  change its TS interface in the same edit.
- `src/pages/Home.tsx` is a minimal example of the wiring: TanStack Query's `useQuery`
  with `apiGet<StatusCheck[]>("/status")` as the `queryFn`. It is a **non-blocking
  connectivity probe**, not a proof of the round trip — the result is deliberately
  discarded so the splash renders identically with no backend. `apiGet<T>` does no
  runtime validation either; `T` is your assertion, not a check. See the
  static-preview rule in `TEMPLATE.md` §4 for why no page may be gated on a fetch.

## TypeScript

`frontend/tsconfig.app.json` / `tsconfig.node.json` have `strict: true`. In the
pod:

```bash
cd frontend && yarn typecheck
```

— plain `tsc --noEmit` run from `frontend/` checks ZERO files (root tsconfig uses
project references with `"files": []`) and exits 0 even with type errors. Always
use `-b` for the frontend. Lint with `cd frontend && yarn lint` (oxlint).

## Data fetching

TanStack Query is wired: `QueryClientProvider` in `src/main.tsx`, `useQuery` demo
in `src/pages/Home.tsx` (see above). Use `useQuery`/`useMutation`, not
fetch-in-`useEffect`.

## Completion gate (tier 1)

When the build is complete, run tier 1 once, all in the same turn: a curl smoke
over the key `/api` endpoints (assert status AND a response field, plus one
negative case), `cd frontend && yarn typecheck`, and ONE happy-path browser pass
through the core user journey. Clean on all three → finish; any failure is a real
bug — fix it, re-run the failed check, and escalate to the testing subagent.
No routine typecheck/lint/smoke passes during the build — tier 1 runs exactly once.


## Testing

Two lanes.

**Backend (pytest)** — specs in `backend/tests/` as `test_*.py`, run with:

```bash
cd /app/backend && pytest
```

`backend/pytest.ini` is canonical: `addopts = -n 2 --dist loadscope` (pytest-xdist,
already parallel — do not pass your own `-n`) and `asyncio_mode = auto` (so
`async def test_...` needs no marker). Serial is `-n 0`, **never**
`-p no:xdist` (that errors, because `addopts` still passes `-n`/`--dist`).
`backend/tests/conftest.py` is pre-scaffolded — a sync `client` fixture
(`httpx.Client` rooted at `/api`), an async `aclient`, and an `api_url()` helper,
all pointed at `BACKEND_URL` (default `http://localhost:8001`). Tests hit the
live uvicorn process, so the app under test is the one the browser sees. Add
app-specific fixtures below the marker; do not re-create the file.

**Frontend (Playwright)** — `/app/tests/` is pre-scaffolded:
`playwright.config.ts` (canonical — edit the marked lines only; runs desktop
on one worker, `PW_MOBILE=1` switches to mobile),
`fixtures/helpers.ts`, and a `package.json` that resolves
`@playwright/test@1.62.0` (node_modules baked into the image). Write specs into
`tests/e2e/`. Do NOT re-create the config/helpers or install/upgrade playwright —
matching Chromium browsers live at `/pw-browsers`.

The backend lane is pytest: this template's backend is Python, so `vitest` does
not apply to it.

## Pod conventions

This template runs under supervisord in the Emergent agent pod — supersedes any
local-run instructions above.

- Backend, frontend, and `mongod` are each a supervisor program. After code or
  config changes, restart and wait for readiness:

  ```bash
  sudo supervisorctl restart frontend backend
  until curl -sf -o /dev/null http://localhost:3000; do sleep 2; done
  ```

- Status, only after a restart you triggered:
  `sudo supervisorctl status frontend backend`. Logs:
  `/var/log/supervisor/backend.err.log`, `backend.out.log`,
  `frontend.err.log`.
- App in a browser: the pod's preview URL (frontend, port `3000`). Backend API
  directly at port `8001`.
- `mongod` runs locally in the pod (`--bind_ip_all`); `MONGO_URL` in
  `backend/.env` points at `localhost`, no separate Mongo container.
- Both dev servers hot-reload on file edits (uvicorn `--reload` for the backend,
  Vite HMR for the frontend); no rebuild step needed for normal iteration. A
  restart is still needed after changing `.env`, `requirements.txt`, or
  `vite.config.ts`.

from fastapi import APIRouter

from lib.dates import today_iso
from lib.sim import analyze
from models.cloudcost import CatalogItem, ResourceEstimate, SimulationRequest, SimulationResponse, TodayResponse

router = APIRouter(prefix="/simulation", tags=["simulation"])

CATALOG = [
    CatalogItem(kind="vm", label="Compute VM", description="Micro → 2X-Large instances", unit="instance", hourly_rate=0.096, color="#f5c518"),
    CatalogItem(kind="storage", label="Storage", description="Object or block SSD", unit="GB", hourly_rate=0.023, color="#4db8ff"),
    CatalogItem(kind="network", label="Network", description="Egress or load balancer", unit="GB / svc", hourly_rate=0.09, color="#3dd68c"),
    CatalogItem(kind="database", label="Managed database", description="Single-AZ or Multi-AZ", unit="instance", hourly_rate=0.145, color="#f472b6"),
    CatalogItem(kind="serverless", label="Serverless", description="Functions / invocations", unit="M req", hourly_rate=0.2, color="#fb923c"),
    CatalogItem(kind="container", label="Containers", description="Orchestrated container compute", unit="vCPU", hourly_rate=0.04, color="#a78bfa"),
    CatalogItem(kind="cache", label="Cache", description="Managed Redis / Memcached", unit="node", hourly_rate=0.068, color="#22d3ee"),
    CatalogItem(kind="cdn", label="CDN", description="Edge content delivery", unit="TB", hourly_rate=0.085, color="#94a3b8"),
    CatalogItem(kind="queue", label="Queue / Messaging", description="Queues and pub/sub", unit="M msg", hourly_rate=0.4, color="#eab308"),
]


@router.get("/catalog", response_model=list[CatalogItem])
async def get_catalog() -> list[CatalogItem]:
    return CATALOG


@router.post("/analyze", response_model=SimulationResponse)
async def analyze_simulation(input: SimulationRequest) -> SimulationResponse:
    result = analyze(
        input.resources,
        workload=input.workload,
        hours_per_month=input.hours_per_month,
        provider=input.provider,
        pricing_model=input.pricing_model,
        region=input.region,
    )
    return SimulationResponse(
        total_monthly_cost=result["total_monthly_cost"],
        projected_annual_cost=result["projected_annual_cost"],
        estimated_savings=result["estimated_savings"],
        utilization_score=result["utilization_score"],
        resource_estimates=[ResourceEstimate(**item) for item in result["resource_estimates"]],
        by_kind=result["by_kind"],
        generated_at=result["generated_at"],
    )


@router.get("/today", response_model=TodayResponse)
async def simulation_today() -> TodayResponse:
    return TodayResponse(date=today_iso())

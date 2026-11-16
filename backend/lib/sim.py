"""Deterministic multi-cloud pricing simulation (mirrors frontend/src/lib/sim.ts)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

PRICING_MULTIPLIER = {
    "on_demand": 1.0,
    "reserved_1y": 0.68,
    "reserved_3y": 0.45,
    "spot": 0.28,
}

REGION_MULTIPLIER = {
    "us-east": 1.0,
    "us-west": 1.05,
    "eu-central": 1.12,
    "ap-southeast": 1.18,
}

TIER_WEIGHT = {
    "micro": 0.5,
    "small": 1.0,
    "medium": 2.0,
    "large": 4.0,
    "xlarge": 8.0,
    "2xlarge": 16.0,
}

KINDS = ("vm", "storage", "network", "database", "serverless", "container", "cache", "cdn", "queue")

BASE_HOURLY = {
    "aws": {
        "vm": 0.096,
        "storage": 0.023 / 730,
        "network": 0.09 / 730,
        "database": 0.145,
        "serverless": 0.2 / 730,
        "container": 0.04,
        "cache": 0.068,
        "cdn": 0.085 / 730,
        "queue": 0.4 / 730,
    },
    "gcp": {
        "vm": 0.091,
        "storage": 0.02 / 730,
        "network": 0.085 / 730,
        "database": 0.138,
        "serverless": 0.18 / 730,
        "container": 0.038,
        "cache": 0.065,
        "cdn": 0.08 / 730,
        "queue": 0.38 / 730,
    },
    "azure": {
        "vm": 0.099,
        "storage": 0.024 / 730,
        "network": 0.087 / 730,
        "database": 0.152,
        "serverless": 0.21 / 730,
        "container": 0.042,
        "cache": 0.072,
        "cdn": 0.087 / 730,
        "queue": 0.42 / 730,
    },
}

PROVIDER_FACTOR = {"aws": 1.0, "gcp": 0.97, "azure": 1.03}


def _safe(value: float, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if number != number or number in (float("inf"), float("-inf")) or number < 0:
        return fallback
    return number


def sanitize_resource(resource: Any) -> dict[str, Any]:
    data = resource.model_dump() if hasattr(resource, "model_dump") else dict(resource)
    name = str(data.get("name") or "").strip() or "unnamed"
    data["name"] = name[:48]
    data["quantity"] = max(1, min(100, int(_safe(data.get("quantity", 1), 1) or 1)))
    data["size"] = max(0.1, min(10000.0, _safe(data.get("size", 1), 1)))
    data["utilization"] = max(0, min(100, int(round(_safe(data.get("utilization", 50), 50)))))
    data["tier"] = data.get("tier") or "small"
    data["storage_class"] = data.get("storage_class") or ("object" if data.get("kind") == "storage" else None)
    data["db_ha"] = data.get("db_ha") or ("single_az" if data.get("kind") == "database" else None)
    data["network_service"] = data.get("network_service") or ("egress" if data.get("kind") == "network" else None)
    data["environment"] = data.get("environment") or "non_production"
    data["region"] = data.get("region") or "us-east"
    data["sku"] = str(data["sku"])[:48] if data.get("sku") else None
    data["engine"] = str(data["engine"])[:48] if data.get("engine") else None
    data["service_tier"] = str(data["service_tier"])[:48] if data.get("service_tier") else None
    return data


def _unit_cost(resource: dict[str, Any], provider: str, pricing_model: str, hours: int) -> tuple[float, bool]:
    base = BASE_HOURLY[provider][resource["kind"]] * PROVIDER_FACTOR[provider]
    model_mul = PRICING_MULTIPLIER.get(pricing_model, 1.0)
    region_mul = REGION_MULTIPLIER.get(resource["region"], 1.0)
    kind = resource["kind"]

    sku = str(resource.get("sku") or "").lower()
    engine = str(resource.get("engine") or "").lower()
    service_tier = str(resource.get("service_tier") or "")

    if kind in {"vm", "container", "cache"}:
        size_mul = resource["size"] if kind == "container" else 1.0
        sub_mul = 1.7 if (kind == "cache" and "ha" in service_tier.lower()) else 1.0
        return base * TIER_WEIGHT.get(resource["tier"], 1.0) * hours * model_mul * region_mul * size_mul * sub_mul, False
    if kind == "database":
        ha_mul = 1.85 if resource.get("db_ha") == "multi_az" else 1.0
        engine_mul = 1.25 if "aurora" in engine else 1.0
        return base * TIER_WEIGHT.get(resource["tier"], 1.0) * hours * model_mul * region_mul * ha_mul * engine_mul, False
    if kind == "storage":
        gb_rate = {"gcp": 0.02, "azure": 0.024}.get(provider, 0.023)
        class_mul = 4.2 if resource.get("storage_class") == "block_ssd" else 1.0
        if "ia" in sku or "nearline" in sku or "cool" in sku:
            class_mul = 0.55
        elif "io2" in sku or "extreme" in sku:
            class_mul = 6.5
        model = model_mul if resource.get("storage_class") == "block_ssd" else 1.0
        return gb_rate * resource["size"] * class_mul * region_mul * model, False
    if kind == "network":
        if resource.get("network_service") == "alb":
            return 18.0 * region_mul * model_mul, True
        egress = {"gcp": 0.085, "azure": 0.087}.get(provider, 0.09)
        return egress * resource["size"] * region_mul, True
    if kind == "serverless":
        mem_mul = 1.0
        st = f"{sku} {service_tier}".lower()
        if "128" in st:
            mem_mul = 0.6
        elif "1024" in st or "1gb" in st or "1 core" in st:
            mem_mul = 2.0
        elif "2048" in st or "2gb" in st:
            mem_mul = 3.8
        return 0.2 * resource["size"] * region_mul * model_mul * mem_mul, True
    if kind == "cdn":
        rate = {"gcp": 0.08, "azure": 0.087}.get(provider, 0.085)
        st = f"{sku} {service_tier}".lower()
        tier_mul = 1.25 if ("all" in st or "premium" in st) else 1.0
        return rate * resource["size"] * 1000 * region_mul * tier_mul, True
    st = f"{sku} {service_tier}".lower()
    queue_mul = 1.5 if ("fifo" in st or "premium" in st) else 1.0
    return 0.4 * resource["size"] * region_mul * queue_mul, True


def _status(utilization: int, kind: str, tier: str | None) -> str:
    if utilization < 20:
        return "idle"
    large = tier in {"large", "xlarge", "2xlarge"}
    heavy = kind in {"vm", "database", "container", "cache"}
    if heavy and large and utilization < 25:
        return "overprovisioned"
    if utilization < 45:
        return "overprovisioned"
    return "healthy"


def analyze(
    resources: list[Any],
    *,
    workload: int,
    hours_per_month: int,
    provider: str = "aws",
    pricing_model: str = "on_demand",
    region: str = "us-east",
) -> dict[str, Any]:
    provider = provider if provider in BASE_HOURLY else "aws"
    pricing_model = pricing_model if pricing_model in PRICING_MULTIPLIER else "on_demand"
    hours = max(1, min(730, int(_safe(hours_per_month, 730) or 730)))
    workload_pct = max(0.0, min(100.0, _safe(workload, 50))) / 100.0

    estimates: list[dict[str, Any]] = []
    by_kind = {k: 0.0 for k in KINDS}
    total = 0.0
    weighted_util = 0.0
    weight = 0.0

    for raw in resources:
        resource = sanitize_resource(raw)
        if not resource.get("region"):
            resource["region"] = region
        unit, scales = _unit_cost(resource, provider, pricing_model, hours)
        effective_util = min(100, round(resource["utilization"] * 0.7 + workload * 0.3))
        scale = max(0.05, (effective_util / 100.0) * (0.35 + workload_pct * 0.65)) if scales else 1.0
        monthly = unit * resource["quantity"] * scale
        status = _status(effective_util, resource["kind"], resource.get("tier"))
        estimates.append(
            {
                "resource_id": resource["id"],
                "monthly_cost": round(monthly, 2),
                "unit_cost": round(unit, 2),
                "utilization": effective_util,
                "status": status,
                "scales_with_workload": scales,
            }
        )
        by_kind[resource["kind"]] = by_kind.get(resource["kind"], 0.0) + monthly
        total += monthly
        weighted_util += effective_util * resource["quantity"]
        weight += resource["quantity"]

    savings = sum(
        item["monthly_cost"] * (0.35 if item["status"] == "idle" else 0.18)
        for item in estimates
        if item["status"] != "healthy"
    )
    total_round = round(total, 2)
    return {
        "total_monthly_cost": total_round,
        "projected_annual_cost": round(total_round * 12, 2),
        "estimated_savings": round(savings, 2),
        "utilization_score": round(weighted_util / weight) if weight else 0,
        "resource_estimates": estimates,
        "by_kind": {k: round(v, 2) for k, v in by_kind.items()},
        "generated_at": datetime.now(timezone.utc),
    }

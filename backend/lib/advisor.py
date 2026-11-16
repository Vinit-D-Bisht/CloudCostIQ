"""Deterministic recommendation heuristics (free-tier safe fallback)."""

from __future__ import annotations

from typing import Any

LARGE = {"large", "xlarge", "2xlarge"}
TIER_ORDER = ["micro", "small", "medium", "large", "xlarge", "2xlarge"]


def rule_recommendations(
    resources: list[Any],
    simulation: Any,
    pricing_model: str = "on_demand",
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    estimates = {
        item.resource_id if hasattr(item, "resource_id") else item["resource_id"]: item
        for item in (simulation.resource_estimates if hasattr(simulation, "resource_estimates") else simulation["resource_estimates"])
    }

    for raw in resources:
        resource = raw.model_dump() if hasattr(raw, "model_dump") else dict(raw)
        estimate = estimates.get(resource["id"])
        if not estimate:
            continue
        monthly = estimate.monthly_cost if hasattr(estimate, "monthly_cost") else estimate["monthly_cost"]
        util = estimate.utilization if hasattr(estimate, "utilization") else estimate["utilization"]
        status = estimate.status if hasattr(estimate, "status") else estimate["status"]
        tier = resource.get("tier") or "small"
        kind = resource["kind"]
        name = resource["name"]
        env = resource.get("environment") or "non_production"

        if kind == "vm" and tier in LARGE and util < 25:
            idx = max(0, TIER_ORDER.index(tier) - 2) if tier in TIER_ORDER else 2
            nxt = TIER_ORDER[idx]
            out.append(
                {
                    "title": f"Right-size over-provisioned {name}",
                    "rationale": f"Utilization is {util}% on a {tier} instance. Stepping down toward {nxt} cuts waste.",
                    "estimated_monthly_saving": round(monthly * 0.42, 2),
                    "priority": "high",
                    "action": f"Downgrade to {nxt}",
                }
            )

        if kind == "storage" and resource.get("storage_class") == "block_ssd" and util < 20:
            out.append(
                {
                    "title": f"Review high-tier disk on {name}",
                    "rationale": "Block SSD on an idle footprint. Move cold data to object storage or shrink GB.",
                    "estimated_monthly_saving": round(monthly * 0.55, 2),
                    "priority": "high",
                    "action": "Switch to object storage or reduce GB",
                }
            )

        if env == "non_production" and kind in {"vm", "database"} and pricing_model != "spot":
            out.append(
                {
                    "title": f"Use Spot/Preemptible for {name}",
                    "rationale": "Non-production tolerates interruption. Spot (~0.28×) fits staging and batch jobs.",
                    "estimated_monthly_saving": round(monthly * 0.72, 2),
                    "priority": "medium",
                    "action": "Switch pricing model to Spot",
                }
            )

        if (
            env == "production"
            and 55 <= util <= 85
            and pricing_model == "on_demand"
            and kind in {"vm", "database"}
        ):
            out.append(
                {
                    "title": f"Reserve steady baseline for {name}",
                    "rationale": "Stable production load. A 1-year reserved commitment (~0.68×) locks in savings.",
                    "estimated_monthly_saving": round(monthly * 0.32, 2),
                    "priority": "medium",
                    "action": "Commit to 1-year reserved",
                }
            )

        if status == "idle":
            out.append(
                {
                    "title": f"Schedule or stop idle {name}",
                    "rationale": "Utilization below 20%. Providers still bill provisioned compute and disk.",
                    "estimated_monthly_saving": round(monthly * 0.35, 2),
                    "priority": "high",
                    "action": "Add off-hours schedule",
                }
            )

    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in sorted(out, key=lambda row: row["estimated_monthly_saving"], reverse=True):
        if item["title"] in seen:
            continue
        seen.add(item["title"])
        unique.append(item)

    if not unique:
        unique.append(
            {
                "title": "Keep baseline and monitor drift",
                "rationale": "Footprint looks balanced. Run a peak scenario before a long commitment.",
                "estimated_monthly_saving": 0,
                "priority": "low",
                "action": "Run peak-load scenario",
            }
        )
    return unique[:6]

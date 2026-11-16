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
        monthly = float(estimate.monthly_cost if hasattr(estimate, "monthly_cost") else estimate["monthly_cost"])
        util = int(estimate.utilization if hasattr(estimate, "utilization") else estimate["utilization"])
        status = str(estimate.status if hasattr(estimate, "status") else estimate["status"])
        tier = resource.get("tier") or "small"
        kind = resource["kind"]
        name = resource["name"]
        env = resource.get("environment") or "non_production"
        size = float(resource.get("size") or 1)

        # Rule 1: Idle or underutilized cache
        if kind == "cache" and util < 25:
            out.append(
                {
                    "title": f"Downscale underutilized cache on {name}",
                    "rationale": f"Problem: Cache utilization is only {util}%. Why it matters: In-memory cache instances are billed on provisioned capacity regardless of active key access. Action: Downscale to a smaller cache tier or schedule off-peak sleep.",
                    "estimated_monthly_saving": round(monthly * 0.45, 2),
                    "priority": "medium",
                    "action": "Downscale cache node tier",
                    "risk": "Slight temporary cold-start cache latency during node resize.",
                }
            )

        # Rule 2: Oversized container configurations
        if kind == "container" and (util < 30 or (size >= 4 and util < 45)):
            out.append(
                {
                    "title": f"Right-size container allocations for {name}",
                    "rationale": f"Problem: Container service shows {util}% utilization with {size} vCPU allocated. Why it matters: Excess task allocations inflate provisioned infrastructure spend. Action: Reduce CPU and memory limits to match observed peak demand.",
                    "estimated_monthly_saving": round(monthly * 0.38, 2),
                    "priority": "high",
                    "action": "Reduce allocated task vCPU / RAM",
                    "risk": "Ensure Horizontal Pod Autoscaling (HPA) thresholds trigger before saturation.",
                }
            )

        # Rule 3: Provisioned but unused CDN
        if kind == "cdn" and util < 20:
            out.append(
                {
                    "title": f"Review idle CDN distribution {name}",
                    "rationale": f"Problem: Edge distribution has minimal traffic ({util}% utilization). Why it matters: Idle edge distributions incur base tier charges without performance benefits. Action: Switch to regional Price Class 100 or route directly to origin.",
                    "estimated_monthly_saving": round(monthly * 0.50, 2),
                    "priority": "low",
                    "action": "Switch to Price Class 100 or consolidate",
                    "risk": "Marginal latency increase for distant global users.",
                }
            )

        # Rule 4: High network egress costs
        if kind == "network" and resource.get("network_service") != "alb" and (size > 500 or monthly > 35):
            out.append(
                {
                    "title": f"Mitigate high network egress on {name}",
                    "rationale": f"Problem: Monthly egress volume is {size} GB, generating heavy data transfer fees. Why it matters: Cloud egress fees ($0.085–$0.09/GB) scale directly with outbound data. Action: Enable response compression and cache static responses at edge CDN.",
                    "estimated_monthly_saving": round(monthly * 0.35, 2),
                    "priority": "high",
                    "action": "Enable CDN caching & gzip/brotli compression",
                    "risk": "Requires cache invalidation logic on dynamic data updates.",
                }
            )

        # Rule 5: On-demand vs reserved compute
        if (
            env == "production"
            and 50 <= util <= 85
            and pricing_model == "on_demand"
            and kind in {"vm", "database"}
        ):
            out.append(
                {
                    "title": f"Commit to 1-Year Reserved Plan for {name}",
                    "rationale": f"Problem: Stable production workload is running on full-rate On-Demand pricing. Why it matters: Predictable baselines overpay ~32% compared to committed-use discounts. Action: Purchase 1-year Compute Savings Plan or Reserved Instances.",
                    "estimated_monthly_saving": round(monthly * 0.32, 2),
                    "priority": "high",
                    "action": "Commit to 1-year reserved plan",
                    "risk": "Financial commitment locks capacity for 12 months.",
                }
            )

        # Rule 6: Spot instances for suitable non-production workloads
        if env == "non_production" and kind == "vm" and pricing_model != "spot":
            out.append(
                {
                    "title": f"Convert non-production VM {name} to Spot",
                    "rationale": f"Problem: Non-production instance is running on On-Demand pricing. Why it matters: Non-production environments easily tolerate occasional interruption. Action: Migrate to Spot / Preemptible instances for ~72% savings.",
                    "estimated_monthly_saving": round(monthly * 0.72, 2),
                    "priority": "medium",
                    "action": "Enable Spot / Preemptible pricing",
                    "risk": "Spot instances can be interrupted with a 2-minute notice; never use for stateful production.",
                }
            )

        # Rule 7: Development vs staging vs production environment rightsizing (Multi-AZ in non-prod)
        if env == "non_production" and kind == "database" and resource.get("db_ha") == "multi_az":
            out.append(
                {
                    "title": f"Disable Multi-AZ for non-production DB {name}",
                    "rationale": f"Problem: Multi-AZ standby replica is active in a non-production database. Why it matters: Multi-AZ adds an 85% cost surcharge for standby redundancy that dev/staging does not require. Action: Switch database to Single-AZ deployment.",
                    "estimated_monthly_saving": round(monthly * 0.45, 2),
                    "priority": "high",
                    "action": "Switch to Single-AZ",
                    "risk": "No automated multi-zone failover during rare cloud provider maintenance.",
                }
            )

        # Rule 8: Storage tier optimization (cold block SSD -> object)
        if kind == "storage" and resource.get("storage_class") == "block_ssd" and (util < 30 or size > 500):
            out.append(
                {
                    "title": f"Optimize high-tier block SSD on {name}",
                    "rationale": f"Problem: {size} GB of Block SSD shows low utilization ({util}%). Why it matters: Provisioned block storage costs 4.2x more than object storage even when unaccessed. Action: Move snapshots and cold data to S3/GCS or downsize volume.",
                    "estimated_monthly_saving": round(monthly * 0.55, 2),
                    "priority": "high",
                    "action": "Migrate cold data to Object Storage",
                    "risk": "Object storage has higher latency for random I/O operations.",
                }
            )

        # Rule 9: Database overprovisioning
        if kind == "database" and tier in LARGE and util < 25:
            idx = max(0, TIER_ORDER.index(tier) - 2) if tier in TIER_ORDER else 2
            nxt = TIER_ORDER[idx]
            out.append(
                {
                    "title": f"Right-size over-provisioned database {name}",
                    "rationale": f"Problem: High-tier {tier} database has only {util}% utilization. Why it matters: Large database classes carry significant licensing and memory reservation costs. Action: Step down instance class to {nxt}.",
                    "estimated_monthly_saving": round(monthly * 0.48, 2),
                    "priority": "high",
                    "action": f"Downgrade DB class to {nxt}",
                    "risk": "Brief maintenance window (<60 seconds) during instance modification.",
                }
            )

        # Rule 10: Serverless workload optimization
        if kind == "serverless" and size >= 15 and util >= 60:
            out.append(
                {
                    "title": f"Evaluate container baseline for high-volume {name}",
                    "rationale": f"Problem: Sustained high request volume ({size}M req/mo) on serverless functions. Why it matters: Constant high-concurrency serverless invocations exceed the cost of dedicated containers. Action: Shift sustained baseline traffic to Cloud Run or ECS Fargate.",
                    "estimated_monthly_saving": round(monthly * 0.40, 2),
                    "priority": "medium",
                    "action": "Migrate sustained traffic to container baseline",
                    "risk": "Requires container deployment manifests and health check probe configuration.",
                }
            )

        # Rule 11: General overprovisioned VM right-sizing
        if kind == "vm" and tier in LARGE and util < 25:
            idx = max(0, TIER_ORDER.index(tier) - 2) if tier in TIER_ORDER else 2
            nxt = TIER_ORDER[idx]
            out.append(
                {
                    "title": f"Right-size over-provisioned VM {name}",
                    "rationale": f"Problem: Utilization is {util}% on a {tier} instance. Why it matters: Idle CPU cycles are billed continuously. Action: Step down toward {nxt} to cut waste.",
                    "estimated_monthly_saving": round(monthly * 0.42, 2),
                    "priority": "high",
                    "action": f"Downgrade to {nxt}",
                    "risk": "Verify application memory working set fits within smaller RAM limit.",
                }
            )

        # Rule 12: General Idle resources
        if status == "idle" and kind not in {"cdn", "cache"}:
            out.append(
                {
                    "title": f"Schedule off-hours or decommission idle {name}",
                    "rationale": f"Problem: Modeled utilization is below 20%. Why it matters: Cloud providers bill provisioned compute and disk regardless of usage. Action: Add off-hours schedule or terminate if orphaned.",
                    "estimated_monthly_saving": round(monthly * 0.35, 2),
                    "priority": "high",
                    "action": "Add off-hours auto-stop schedule",
                    "risk": "Ensure no background batch processes depend on this resource off-hours.",
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
                "rationale": "Problem: None detected. Why it matters: Current footprint is well-utilized across nodes. Action: Re-evaluate during peak traffic events.",
                "estimated_monthly_saving": 0,
                "priority": "low",
                "action": "Run peak-load scenario",
                "risk": "No risk — baseline is stable.",
            }
        )
    return unique[:8]

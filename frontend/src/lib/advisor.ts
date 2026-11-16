import type { Recommendation } from "./types";
import {
  INSTANCE_TIERS,
  type ResourceConfig,
  type SimulationResponse,
  sanitizeResource,
} from "./sim";

const LARGE_TIERS = new Set(["large", "xlarge", "2xlarge"]);

/** Deterministic rule engine — always available when Ollama / free API are offline. */
export function ruleRecommendations(
  resources: ResourceConfig[],
  simulation: SimulationResponse,
  pricingModel: string,
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const raw of resources) {
    const resource = sanitizeResource(raw);
    const estimate = simulation.resource_estimates.find((item) => item.resource_id === resource.id);
    if (!estimate) continue;

    // Rule 1: Idle or underutilized cache
    if (resource.kind === "cache" && estimate.utilization < 25) {
      out.push({
        title: `Downscale underutilized cache on ${resource.name}`,
        rationale: `Problem: Cache utilization is only ${estimate.utilization}%. Why it matters: In-memory cache instances are billed on provisioned capacity regardless of active key access. Action: Downscale to a smaller cache tier or schedule off-peak sleep.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.45 * 100) / 100,
        priority: "medium",
        action: "Downscale cache node tier",
        risk: "Slight temporary cold-start cache latency during node resize.",
      });
    }

    // Rule 2: Oversized container configurations
    if (
      resource.kind === "container" &&
      (estimate.utilization < 30 || (resource.size >= 4 && estimate.utilization < 45))
    ) {
      out.push({
        title: `Right-size container allocations for ${resource.name}`,
        rationale: `Problem: Container service shows ${estimate.utilization}% utilization with ${resource.size} vCPU allocated. Why it matters: Excess task allocations inflate provisioned infrastructure spend. Action: Reduce CPU and memory limits to match observed peak demand.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.38 * 100) / 100,
        priority: "high",
        action: "Reduce allocated task vCPU / RAM",
        risk: "Ensure Horizontal Pod Autoscaling (HPA) thresholds trigger before saturation.",
      });
    }

    // Rule 3: Provisioned but unused CDN
    if (resource.kind === "cdn" && estimate.utilization < 20) {
      out.push({
        title: `Review idle CDN distribution ${resource.name}`,
        rationale: `Problem: Edge distribution has minimal traffic (${estimate.utilization}% utilization). Why it matters: Idle edge distributions incur base tier charges without performance benefits. Action: Switch to regional Price Class 100 or route directly to origin.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.50 * 100) / 100,
        priority: "low",
        action: "Switch to Price Class 100 or consolidate",
        risk: "Marginal latency increase for distant global users.",
      });
    }

    // Rule 4: High network egress costs
    if (
      resource.kind === "network" &&
      resource.network_service !== "alb" &&
      (resource.size > 500 || estimate.monthly_cost > 35)
    ) {
      out.push({
        title: `Mitigate high network egress on ${resource.name}`,
        rationale: `Problem: Monthly egress volume is ${resource.size} GB, generating heavy data transfer fees. Why it matters: Cloud egress fees ($0.085–$0.09/GB) scale directly with outbound data. Action: Enable response compression and cache static responses at edge CDN.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.35 * 100) / 100,
        priority: "high",
        action: "Enable CDN caching & gzip/brotli compression",
        risk: "Requires cache invalidation logic on dynamic data updates.",
      });
    }

    // Rule 5: On-demand vs reserved compute for stable production
    if (
      resource.environment === "production" &&
      estimate.utilization >= 50 &&
      estimate.utilization <= 85 &&
      pricingModel === "on_demand" &&
      (resource.kind === "vm" || resource.kind === "database")
    ) {
      out.push({
        title: `Commit to 1-Year Reserved Plan for ${resource.name}`,
        rationale: `Problem: Stable production workload is running on full-rate On-Demand pricing. Why it matters: Predictable baselines overpay ~32% compared to committed-use discounts. Action: Purchase 1-year Compute Savings Plan or Reserved Instances.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.32 * 100) / 100,
        priority: "high",
        action: "Commit to 1-year reserved plan",
        risk: "Financial commitment locks capacity for 12 months.",
      });
    }

    // Rule 6: Spot instances for suitable non-production workloads
    if (
      resource.environment === "non_production" &&
      resource.kind === "vm" &&
      pricingModel !== "spot"
    ) {
      out.push({
        title: `Convert non-production VM ${resource.name} to Spot`,
        rationale: `Problem: Non-production instance is running on On-Demand pricing. Why it matters: Non-production environments easily tolerate occasional interruption. Action: Migrate to Spot / Preemptible instances for ~72% savings.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.72 * 100) / 100,
        priority: "medium",
        action: "Enable Spot / Preemptible pricing",
        risk: "Spot instances can be interrupted with a 2-minute notice; never use for stateful production.",
      });
    }

    // Rule 7: Development vs staging vs production environment rightsizing (Multi-AZ on non-prod)
    if (
      resource.environment === "non_production" &&
      resource.kind === "database" &&
      resource.db_ha === "multi_az"
    ) {
      out.push({
        title: `Disable Multi-AZ for non-production DB ${resource.name}`,
        rationale: `Problem: Multi-AZ standby replica is active in a non-production database. Why it matters: Multi-AZ adds an 85% cost surcharge for standby redundancy that dev/staging does not require. Action: Switch database to Single-AZ deployment.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.45 * 100) / 100,
        priority: "high",
        action: "Switch to Single-AZ",
        risk: "No automated multi-zone failover during rare cloud provider maintenance.",
      });
    }

    // Rule 8: Storage tier optimization (cold block SSD -> object)
    if (
      resource.kind === "storage" &&
      resource.storage_class === "block_ssd" &&
      (estimate.utilization < 30 || resource.size > 500)
    ) {
      out.push({
        title: `Optimize high-tier block SSD on ${resource.name}`,
        rationale: `Problem: ${resource.size} GB of Block SSD shows low utilization (${estimate.utilization}%). Why it matters: Provisioned block storage costs 4.2x more than object storage even when unaccessed. Action: Move snapshots and cold data to S3/GCS or downsize volume.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.55 * 100) / 100,
        priority: "high",
        action: "Migrate cold data to Object Storage",
        risk: "Object storage has higher latency for random random I/O operations.",
      });
    }

    // Rule 9: Database overprovisioning
    if (
      resource.kind === "database" &&
      LARGE_TIERS.has(resource.tier ?? "small") &&
      estimate.utilization < 25
    ) {
      const next = INSTANCE_TIERS[Math.max(0, INSTANCE_TIERS.findIndex((t) => t.id === resource.tier) - 2)];
      out.push({
        title: `Right-size over-provisioned database ${resource.name}`,
        rationale: `Problem: High-tier ${resource.tier} database has only ${estimate.utilization}% utilization. Why it matters: Large database classes carry significant licensing and memory reservation costs. Action: Step down instance class to ${next?.label ?? "Medium"}.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.48 * 100) / 100,
        priority: "high",
        action: `Downgrade DB class to ${next?.id ?? "medium"}`,
        risk: "Brief maintenance window (<60 seconds) during instance modification.",
      });
    }

    // Rule 10: Serverless workload optimization
    if (
      resource.kind === "serverless" &&
      resource.size >= 15 &&
      estimate.utilization >= 60
    ) {
      out.push({
        title: `Evaluate container baseline for high-volume ${resource.name}`,
        rationale: `Problem: Sustained high request volume (${resource.size}M req/mo) on serverless functions. Why it matters: Constant high-concurrency serverless invocations exceed the cost of dedicated containers. Action: Shift sustained baseline traffic to Cloud Run or ECS Fargate.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.40 * 100) / 100,
        priority: "medium",
        action: "Migrate sustained traffic to container baseline",
        risk: "Requires container deployment manifests and health check probe configuration.",
      });
    }

    // Rule 11: General overprovisioned VM right-sizing
    if (
      resource.kind === "vm" &&
      LARGE_TIERS.has(resource.tier ?? "small") &&
      estimate.utilization < 25
    ) {
      const next = INSTANCE_TIERS[Math.max(0, INSTANCE_TIERS.findIndex((t) => t.id === resource.tier) - 2)];
      out.push({
        title: `Right-size over-provisioned VM ${resource.name}`,
        rationale: `Problem: Utilization is ${estimate.utilization}% on a ${resource.tier} instance. Why it matters: Idle CPU cycles are billed continuously. Action: Step down toward ${next?.label ?? "Medium"} to cut waste.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.42 * 100) / 100,
        priority: "high",
        action: `Downgrade to ${next?.id ?? "medium"}`,
        risk: "Verify application memory working set fits within smaller RAM limit.",
      });
    }

    // Rule 12: General Idle resources
    if (estimate.status === "idle" && resource.kind !== "cdn" && resource.kind !== "cache") {
      out.push({
        title: `Schedule off-hours or decommission idle ${resource.name}`,
        rationale: `Problem: Modeled utilization is below 20%. Why it matters: Cloud providers bill provisioned compute and disk regardless of usage. Action: Add off-hours schedule or terminate if orphaned.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.35 * 100) / 100,
        priority: "high",
        action: "Add off-hours auto-stop schedule",
        risk: "Ensure no background batch processes depend on this resource off-hours.",
      });
    }
  }

  // Deduplicate by title, keep top 8 by savings.
  const seen = new Set<string>();
  const unique = out.filter((item) => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });
  unique.sort((a, b) => b.estimated_monthly_saving - a.estimated_monthly_saving);

  if (!unique.length) {
    unique.push({
      title: "Keep baseline and monitor drift",
      rationale: "Problem: None detected. Why it matters: Current footprint is well-utilized across nodes. Action: Re-evaluate during peak traffic events.",
      estimated_monthly_saving: 0,
      priority: "low",
      action: "Run peak-load scenario",
      risk: "No risk — baseline is stable.",
    });
  }

  return unique.slice(0, 8);
}

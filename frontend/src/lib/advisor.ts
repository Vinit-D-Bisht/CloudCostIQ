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

    if (
      resource.kind === "vm" &&
      LARGE_TIERS.has(resource.tier ?? "small") &&
      estimate.utilization < 25
    ) {
      const next = INSTANCE_TIERS[Math.max(0, INSTANCE_TIERS.findIndex((t) => t.id === resource.tier) - 2)];
      out.push({
        title: `Right-size over-provisioned ${resource.name}`,
        rationale: `Utilization is ${estimate.utilization}% on a ${resource.tier} instance. Stepping down toward ${next?.label ?? "Medium"} cuts waste without changing the workload shape.`,
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.42 * 100) / 100,
        priority: "high",
        action: `Downgrade to ${next?.id ?? "medium"}`,
      });
    }

    if (resource.kind === "storage" && resource.storage_class === "block_ssd") {
      const peerVm = resources.find(
        (item) =>
          item.kind === "vm" &&
          (simulation.resource_estimates.find((e) => e.resource_id === item.id)?.utilization ?? 100) < 20,
      );
      if (peerVm || estimate.utilization < 20) {
        out.push({
          title: `Review high-tier disk on ${resource.name}`,
          rationale: "Block SSD is attached to an idle or low-util footprint. Move cold data to object storage or shrink provisioned GB.",
          estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.55 * 100) / 100,
          priority: "high",
          action: "Switch to object storage or reduce GB",
        });
      }
    }

    if (
      resource.environment === "non_production" &&
      (resource.kind === "vm" || resource.kind === "database") &&
      pricingModel !== "spot"
    ) {
      out.push({
        title: `Use Spot/Preemptible for ${resource.name}`,
        rationale: "Non-production environments tolerate interruption. Spot pricing (~0.28×) is a strong fit for staging and batch jobs.",
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.72 * 100) / 100,
        priority: "medium",
        action: "Switch pricing model to Spot",
      });
    }

    if (
      resource.environment === "production" &&
      estimate.utilization >= 55 &&
      estimate.utilization <= 85 &&
      pricingModel === "on_demand" &&
      (resource.kind === "vm" || resource.kind === "database")
    ) {
      out.push({
        title: `Reserve steady baseline for ${resource.name}`,
        rationale: "Utilization is stable. A 1-year reserved commitment (~0.68×) locks in savings on predictable production load.",
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.32 * 100) / 100,
        priority: "medium",
        action: "Commit to 1-year reserved",
      });
    }

    if (estimate.status === "idle") {
      out.push({
        title: `Schedule or stop idle ${resource.name}`,
        rationale: "Modeled utilization is below 20%. Cloud providers still bill provisioned compute and disk.",
        estimated_monthly_saving: Math.round(estimate.monthly_cost * 0.35 * 100) / 100,
        priority: "high",
        action: "Add off-hours schedule",
      });
    }
  }

  // Deduplicate by title, keep top 6 by savings.
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
      rationale: "The modeled footprint looks balanced. Run a peak scenario before locking a long commitment.",
      estimated_monthly_saving: 0,
      priority: "low",
      action: "Run peak-load scenario",
    });
  }

  return unique.slice(0, 6);
}

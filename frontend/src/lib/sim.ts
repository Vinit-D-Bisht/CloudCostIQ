/**
 * Deterministic client-side pricing simulation.
 * Idle compute and provisioned disk stay fixed; only dynamic network/CDN/queue scale with workload.
 */

export type CloudProvider = "aws" | "gcp" | "azure";
export type PricingModel = "on_demand" | "reserved_1y" | "reserved_3y" | "spot";
export type RegionKey = "us-east" | "us-west" | "eu-central" | "ap-southeast";
export type InstanceTier = "micro" | "small" | "medium" | "large" | "xlarge" | "2xlarge";
export type StorageClass = "object" | "block_ssd";
export type DbHa = "single_az" | "multi_az";
export type NetworkService = "egress" | "alb";
export type Environment = "production" | "non_production";
export type ResourceKind =
  | "vm"
  | "storage"
  | "network"
  | "database"
  | "serverless"
  | "container"
  | "cache"
  | "cdn"
  | "queue";

export const RESOURCE_KINDS: ResourceKind[] = [
  "vm",
  "storage",
  "network",
  "database",
  "serverless",
  "container",
  "cache",
  "cdn",
  "queue",
];

export interface ResourceConfig {
  id: string;
  name: string;
  kind: ResourceKind;
  region: RegionKey;
  quantity: number;
  size: number;
  utilization: number;
  tier?: InstanceTier;
  storage_class?: StorageClass;
  db_ha?: DbHa;
  network_service?: NetworkService;
  environment?: Environment;
  sku?: string;
  engine?: string;
  service_tier?: string;
}

export interface SimulationOptions {
  provider: CloudProvider;
  pricingModel: PricingModel;
  region: RegionKey;
  hoursPerMonth: number;
  workload: number;
}

export type ResourceStatus = "healthy" | "overprovisioned" | "idle";

export interface ResourceEstimate {
  resource_id: string;
  monthly_cost: number;
  unit_cost: number;
  utilization: number;
  status: ResourceStatus;
  scales_with_workload: boolean;
}

export interface SimulationResponse {
  total_monthly_cost: number;
  projected_annual_cost: number;
  estimated_savings: number;
  utilization_score: number;
  resource_estimates: ResourceEstimate[];
  by_kind: Record<ResourceKind, number>;
  generated_at: string;
}

export const PROVIDERS: CloudProvider[] = ["aws", "gcp", "azure"];
export const PRICING_MODELS: { id: PricingModel; label: string; multiplier: number }[] = [
  { id: "on_demand", label: "On-Demand", multiplier: 1 },
  { id: "reserved_1y", label: "1-Year Reserved", multiplier: 0.68 },
  { id: "reserved_3y", label: "3-Year Reserved", multiplier: 0.45 },
  { id: "spot", label: "Spot / Preemptible", multiplier: 0.28 },
];
export const REGIONS: { id: RegionKey; label: string; multiplier: number }[] = [
  { id: "us-east", label: "US East", multiplier: 1 },
  { id: "us-west", label: "US West", multiplier: 1.05 },
  { id: "eu-central", label: "EU Central", multiplier: 1.12 },
  { id: "ap-southeast", label: "AP Southeast", multiplier: 1.18 },
];
export const INSTANCE_TIERS: { id: InstanceTier; label: string; weight: number }[] = [
  { id: "micro", label: "Micro", weight: 0.5 },
  { id: "small", label: "Small", weight: 1 },
  { id: "medium", label: "Medium", weight: 2 },
  { id: "large", label: "Large", weight: 4 },
  { id: "xlarge", label: "X-Large", weight: 8 },
  { id: "2xlarge", label: "2X-Large", weight: 16 },
];

/** Base rates by provider × kind. Hourly for provisioned; monthly-ish for metered (normalized in compute). */
const BASE_HOURLY: Record<CloudProvider, Record<ResourceKind, number>> = {
  aws: {
    vm: 0.096,
    storage: 0.023 / 730,
    network: 0.09 / 730,
    database: 0.145,
    serverless: 0.2 / 730,
    container: 0.04,
    cache: 0.068,
    cdn: 0.085 / 730,
    queue: 0.4 / 730,
  },
  gcp: {
    vm: 0.091,
    storage: 0.02 / 730,
    network: 0.085 / 730,
    database: 0.138,
    serverless: 0.18 / 730,
    container: 0.038,
    cache: 0.065,
    cdn: 0.08 / 730,
    queue: 0.38 / 730,
  },
  azure: {
    vm: 0.099,
    storage: 0.024 / 730,
    network: 0.087 / 730,
    database: 0.152,
    serverless: 0.21 / 730,
    container: 0.042,
    cache: 0.072,
    cdn: 0.087 / 730,
    queue: 0.42 / 730,
  },
};

const PROVIDER_FACTOR: Record<CloudProvider, number> = { aws: 1, gcp: 0.97, azure: 1.03 };

function emptyByKind(): Record<ResourceKind, number> {
  return {
    vm: 0,
    storage: 0,
    network: 0,
    database: 0,
    serverless: 0,
    container: 0,
    cache: 0,
    cdn: 0,
    queue: 0,
  };
}

function safeNumber(value: number, fallback = 0): number {
  if (!Number.isFinite(value) || Number.isNaN(value) || value < 0) return fallback;
  return value;
}

function sanitizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length ? trimmed.slice(0, 48) : "unnamed";
}

export function sanitizeResource(resource: ResourceConfig): ResourceConfig {
  const quantity = Math.max(1, Math.min(100, Math.round(safeNumber(resource.quantity, 1)) || 1));
  const size = Math.max(0.1, Math.min(10000, safeNumber(resource.size, 1)));
  const utilization = Math.max(0, Math.min(100, Math.round(safeNumber(resource.utilization, 50))));
  return {
    ...resource,
    name: sanitizeName(resource.name),
    quantity,
    size,
    utilization,
    tier: resource.tier ?? "small",
    storage_class: resource.storage_class ?? (resource.kind === "storage" ? "object" : undefined),
    db_ha: resource.db_ha ?? (resource.kind === "database" ? "single_az" : undefined),
    network_service: resource.network_service ?? (resource.kind === "network" ? "egress" : undefined),
    environment: resource.environment ?? "non_production",
    sku: resource.sku ? String(resource.sku).slice(0, 48) : undefined,
    engine: resource.engine ? String(resource.engine).slice(0, 48) : undefined,
    service_tier: resource.service_tier ? String(resource.service_tier).slice(0, 48) : undefined,
  };
}

function pricingMultiplier(model: PricingModel): number {
  return PRICING_MODELS.find((item) => item.id === model)?.multiplier ?? 1;
}

function regionMultiplier(region: RegionKey): number {
  return REGIONS.find((item) => item.id === region)?.multiplier ?? 1;
}

function tierWeight(tier?: InstanceTier): number {
  return INSTANCE_TIERS.find((item) => item.id === tier)?.weight ?? 1;
}

function computeUnitCost(
  resource: ResourceConfig,
  options: SimulationOptions,
): { unit: number; scales: boolean } {
  const clean = sanitizeResource(resource);
  const base = BASE_HOURLY[options.provider][clean.kind] * PROVIDER_FACTOR[options.provider];
  const modelMul = pricingMultiplier(options.pricingModel);
  const regionMul = regionMultiplier(clean.region || options.region);
  const hours = Math.max(1, Math.min(730, Math.round(safeNumber(options.hoursPerMonth, 730))));

  if (clean.kind === "vm" || clean.kind === "container" || clean.kind === "cache") {
    let subMul = 1;
    if (clean.kind === "cache" && clean.service_tier?.includes("HA")) subMul = 1.7;
    const unit = base * tierWeight(clean.tier) * hours * modelMul * regionMul * (clean.kind === "container" ? clean.size : 1) * subMul;
    return { unit, scales: false };
  }

  if (clean.kind === "database") {
    const haMul = clean.db_ha === "multi_az" ? 1.85 : 1;
    const engineMul = clean.engine?.includes("aurora") ? 1.25 : 1.0;
    const unit = base * tierWeight(clean.tier) * hours * modelMul * regionMul * haMul * engineMul;
    return { unit, scales: false };
  }

  if (clean.kind === "storage") {
    const gbRate = options.provider === "gcp" ? 0.02 : options.provider === "azure" ? 0.024 : 0.023;
    let classMul = clean.storage_class === "block_ssd" ? 4.2 : 1;
    if (clean.sku && (clean.sku.includes("ia") || clean.sku.includes("nearline") || clean.sku.includes("cool"))) {
      classMul = 0.55;
    } else if (clean.sku && (clean.sku.includes("io2") || clean.sku.includes("extreme"))) {
      classMul = 6.5;
    }
    const unit = gbRate * clean.size * classMul * regionMul * (clean.storage_class === "block_ssd" ? modelMul : 1);
    return { unit, scales: false };
  }

  if (clean.kind === "network") {
    if (clean.network_service === "alb") {
      return { unit: 18 * regionMul * modelMul, scales: true };
    }
    const egressRate = options.provider === "gcp" ? 0.085 : options.provider === "azure" ? 0.087 : 0.09;
    return { unit: egressRate * clean.size * regionMul, scales: true };
  }

  if (clean.kind === "serverless") {
    // size = millions of requests / month baseline
    let memMul = 1.0;
    if (clean.sku?.includes("128") || clean.service_tier?.includes("128")) memMul = 0.6;
    else if (clean.sku?.includes("1024") || clean.service_tier?.includes("1024") || clean.service_tier?.includes("1GB") || clean.service_tier?.includes("1 core")) memMul = 2.0;
    else if (clean.sku?.includes("2048") || clean.service_tier?.includes("2048") || clean.service_tier?.includes("2GB")) memMul = 3.8;
    return { unit: 0.2 * clean.size * regionMul * modelMul * memMul, scales: true };
  }

  if (clean.kind === "cdn") {
    // size = TB transferred
    const rate = options.provider === "gcp" ? 0.08 : options.provider === "azure" ? 0.087 : 0.085;
    const tierMul = (clean.sku?.includes("all") || clean.sku?.includes("premium") || clean.service_tier?.includes("Premium")) ? 1.25 : 1.0;
    return { unit: rate * clean.size * 1000 * regionMul * tierMul, scales: true };
  }

  // queue: size = millions of messages
  const queueMul = (clean.sku?.includes("fifo") || clean.sku?.includes("premium") || clean.service_tier?.includes("Premium")) ? 1.5 : 1.0;
  return { unit: 0.4 * clean.size * regionMul * queueMul, scales: true };
}

function statusFor(utilization: number, kind: ResourceKind, tier?: InstanceTier): ResourceStatus {
  if (utilization < 20) return "idle";
  const heavy = kind === "vm" || kind === "database" || kind === "container" || kind === "cache";
  const largeTier = tier === "large" || tier === "xlarge" || tier === "2xlarge";
  if (heavy && largeTier && utilization < 25) return "overprovisioned";
  if (utilization < 45) return "overprovisioned";
  return "healthy";
}

export function simulate(resources: ResourceConfig[], options: SimulationOptions): SimulationResponse {
  const workload = Math.max(0, Math.min(100, safeNumber(options.workload, 50))) / 100;
  const estimates: ResourceEstimate[] = [];
  const by_kind = emptyByKind();
  let total = 0;
  let weightedUtil = 0;
  let weight = 0;

  for (const raw of resources) {
    const resource = sanitizeResource(raw);
    const { unit, scales } = computeUnitCost(resource, options);
    const effectiveUtil = Math.min(100, Math.round(resource.utilization * 0.7 + options.workload * 0.3));
    const scaleFactor = scales ? Math.max(0.05, (effectiveUtil / 100) * (0.35 + workload * 0.65)) : 1;
    const monthly = safeNumber(unit * resource.quantity * scaleFactor);
    const status = statusFor(effectiveUtil, resource.kind, resource.tier);
    estimates.push({
      resource_id: resource.id,
      monthly_cost: Math.round(monthly * 100) / 100,
      unit_cost: Math.round(unit * 100) / 100,
      utilization: effectiveUtil,
      status,
      scales_with_workload: scales,
    });
    by_kind[resource.kind] += monthly;
    total += monthly;
    weightedUtil += effectiveUtil * resource.quantity;
    weight += resource.quantity;
  }

  const savings = estimates
    .filter((item) => item.status !== "healthy")
    .reduce((sum, item) => sum + item.monthly_cost * (item.status === "idle" ? 0.35 : 0.18), 0);

  const roundedKind = emptyByKind();
  for (const kind of RESOURCE_KINDS) {
    roundedKind[kind] = Math.round(by_kind[kind] * 100) / 100;
  }

  const roundedTotal = Math.round(total * 100) / 100;
  return {
    total_monthly_cost: roundedTotal,
    projected_annual_cost: Math.round(roundedTotal * 12 * 100) / 100,
    estimated_savings: Math.round(savings * 100) / 100,
    utilization_score: weight ? Math.round(weightedUtil / weight) : 0,
    resource_estimates: estimates,
    by_kind: roundedKind,
    generated_at: new Date().toISOString(),
  };
}

export function compareProviders(
  resources: ResourceConfig[],
  base: Omit<SimulationOptions, "provider">,
): { provider: CloudProvider; monthly: number }[] {
  return PROVIDERS.map((provider) => ({
    provider,
    monthly: simulate(resources, { ...base, provider }).total_monthly_cost,
  }));
}

/** @deprecated use catalogFor(provider) — kept for older imports */
export const CATALOG = [
  { kind: "vm" as const, label: "Virtual machine", description: "Micro → 2X-Large", unit: "instance", color: "#f5c518" },
  { kind: "storage" as const, label: "Storage", description: "Object or block SSD", unit: "GB", color: "#4db8ff" },
  { kind: "network" as const, label: "Network", description: "Egress or load balancer", unit: "GB / service", color: "#3dd68c" },
  { kind: "database" as const, label: "Managed database", description: "Single-AZ or Multi-AZ", unit: "instance", color: "#f472b6" },
  { kind: "serverless" as const, label: "Serverless", description: "Functions / invocations", unit: "M req", color: "#fb923c" },
  { kind: "container" as const, label: "Containers", description: "Orchestrated container compute", unit: "vCPU", color: "#a78bfa" },
  { kind: "cache" as const, label: "Cache", description: "Managed Redis / Memcached", unit: "node", color: "#22d3ee" },
  { kind: "cdn" as const, label: "CDN", description: "Edge content delivery", unit: "TB", color: "#94a3b8" },
  { kind: "queue" as const, label: "Queue / Messaging", description: "Queues and pub/sub", unit: "M msg", color: "#eab308" },
];

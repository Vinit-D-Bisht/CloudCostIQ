import type { CloudProvider, ResourceKind } from "./sim";

export interface CatalogItem {
  kind: ResourceKind;
  label: string;
  description: string;
  unit: string;
  color: string;
  /** Default size when adding from toolbox */
  defaultSize: number;
  defaultUtil: number;
}

/** Provider-branded service names shown in the toolbox when that cloud is selected. */
export const PROVIDER_CATALOG: Record<CloudProvider, CatalogItem[]> = {
  aws: [
    { kind: "vm", label: "EC2 Instance", description: "t3 / m5 family · Micro → 2X-Large", unit: "instance", color: "#f5c518", defaultSize: 1, defaultUtil: 48 },
    { kind: "storage", label: "S3 / EBS", description: "Object buckets or gp3 block volumes", unit: "GB", color: "#4db8ff", defaultSize: 250, defaultUtil: 60 },
    { kind: "network", label: "ALB / Egress", description: "Application Load Balancer or data transfer", unit: "GB / svc", color: "#3dd68c", defaultSize: 200, defaultUtil: 35 },
    { kind: "database", label: "RDS / Aurora", description: "Managed Postgres · Single or Multi-AZ", unit: "instance", color: "#f472b6", defaultSize: 40, defaultUtil: 50 },
    { kind: "serverless", label: "Lambda", description: "Event-driven functions · request priced", unit: "M req", color: "#fb923c", defaultSize: 5, defaultUtil: 40 },
    { kind: "container", label: "ECS / EKS", description: "Container service or Kubernetes nodes", unit: "vCPU", color: "#a78bfa", defaultSize: 2, defaultUtil: 45 },
    { kind: "cache", label: "ElastiCache", description: "Redis / Memcached in-memory cache", unit: "node", color: "#22d3ee", defaultSize: 1, defaultUtil: 55 },
    { kind: "cdn", label: "CloudFront", description: "Global CDN edge distribution", unit: "TB", color: "#94a3b8", defaultSize: 1, defaultUtil: 50 },
    { kind: "queue", label: "SQS / SNS", description: "Managed queues and pub/sub topics", unit: "M msg", color: "#eab308", defaultSize: 10, defaultUtil: 40 },
  ],
  gcp: [
    { kind: "vm", label: "Compute Engine", description: "e2 / n2 VMs · Micro → 2X-Large", unit: "instance", color: "#f5c518", defaultSize: 1, defaultUtil: 48 },
    { kind: "storage", label: "GCS / Persistent Disk", description: "Buckets or SSD persistent disks", unit: "GB", color: "#4db8ff", defaultSize: 250, defaultUtil: 60 },
    { kind: "network", label: "LB / Egress", description: "HTTP(S) load balancer or egress", unit: "GB / svc", color: "#3dd68c", defaultSize: 200, defaultUtil: 35 },
    { kind: "database", label: "Cloud SQL", description: "Managed Postgres · zonal or regional", unit: "instance", color: "#f472b6", defaultSize: 40, defaultUtil: 50 },
    { kind: "serverless", label: "Cloud Functions", description: "Serverless functions · invocation priced", unit: "M req", color: "#fb923c", defaultSize: 5, defaultUtil: 40 },
    { kind: "container", label: "GKE / Cloud Run", description: "Kubernetes or managed containers", unit: "vCPU", color: "#a78bfa", defaultSize: 2, defaultUtil: 45 },
    { kind: "cache", label: "Memorystore", description: "Managed Redis / Memcached", unit: "node", color: "#22d3ee", defaultSize: 1, defaultUtil: 55 },
    { kind: "cdn", label: "Cloud CDN", description: "Global content delivery", unit: "TB", color: "#94a3b8", defaultSize: 1, defaultUtil: 50 },
    { kind: "queue", label: "Pub/Sub", description: "Global messaging and event fan-out", unit: "M msg", color: "#eab308", defaultSize: 10, defaultUtil: 40 },
  ],
  azure: [
    { kind: "vm", label: "Virtual Machine", description: "B / D-series · Micro → 2X-Large", unit: "instance", color: "#f5c518", defaultSize: 1, defaultUtil: 48 },
    { kind: "storage", label: "Blob / Managed Disk", description: "Blob storage or Premium SSD", unit: "GB", color: "#4db8ff", defaultSize: 250, defaultUtil: 60 },
    { kind: "network", label: "App GW / Egress", description: "Application Gateway or egress", unit: "GB / svc", color: "#3dd68c", defaultSize: 200, defaultUtil: 35 },
    { kind: "database", label: "Azure Database", description: "Flexible Server Postgres · HA options", unit: "instance", color: "#f472b6", defaultSize: 40, defaultUtil: 50 },
    { kind: "serverless", label: "Azure Functions", description: "Serverless compute · execution priced", unit: "M req", color: "#fb923c", defaultSize: 5, defaultUtil: 40 },
    { kind: "container", label: "AKS / Container Apps", description: "Kubernetes or container apps", unit: "vCPU", color: "#a78bfa", defaultSize: 2, defaultUtil: 45 },
    { kind: "cache", label: "Azure Cache", description: "Redis Cache for hot data paths", unit: "node", color: "#22d3ee", defaultSize: 1, defaultUtil: 55 },
    { kind: "cdn", label: "Azure CDN", description: "Front Door / CDN edge delivery", unit: "TB", color: "#94a3b8", defaultSize: 1, defaultUtil: 50 },
    { kind: "queue", label: "Service Bus / Queue", description: "Queues, topics, and event routing", unit: "M msg", color: "#eab308", defaultSize: 10, defaultUtil: 40 },
  ],
};

export function catalogFor(provider: CloudProvider): CatalogItem[] {
  return PROVIDER_CATALOG[provider];
}

export function kindLabel(kind: ResourceKind, provider: CloudProvider = "aws"): string {
  return PROVIDER_CATALOG[provider].find((item) => item.kind === kind)?.label ?? kind;
}

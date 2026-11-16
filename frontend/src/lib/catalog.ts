import type { CloudProvider, InstanceTier, ResourceKind, StorageClass } from "./sim";

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

export interface SkuOption {
  id: string;
  name: string;
  description: string;
  tier?: InstanceTier;
  storage_class?: StorageClass;
}

/** Provider-branded service names shown in the toolbox when that cloud is selected. */
export const PROVIDER_CATALOG: Record<CloudProvider, CatalogItem[]> = {
  aws: [
    { kind: "vm", label: "EC2 Instance", description: "t3 / m5 / c5 family · Micro → 2X-Large", unit: "instance", color: "#f5c518", defaultSize: 1, defaultUtil: 48 },
    { kind: "storage", label: "S3 / EBS", description: "S3 buckets or gp3 / io2 block SSD", unit: "GB", color: "#4db8ff", defaultSize: 250, defaultUtil: 60 },
    { kind: "network", label: "ALB / Egress", description: "Application Load Balancer or data transfer", unit: "GB / svc", color: "#3dd68c", defaultSize: 200, defaultUtil: 35 },
    { kind: "database", label: "RDS / Aurora", description: "Managed PostgreSQL / MySQL · Single or Multi-AZ", unit: "instance", color: "#f472b6", defaultSize: 40, defaultUtil: 50 },
    { kind: "serverless", label: "Lambda", description: "Event-driven functions · 128MB → 2048MB memory", unit: "M req", color: "#fb923c", defaultSize: 5, defaultUtil: 40 },
    { kind: "container", label: "ECS / EKS", description: "Fargate serverless or EKS Kubernetes clusters", unit: "vCPU", color: "#a78bfa", defaultSize: 2, defaultUtil: 45 },
    { kind: "cache", label: "ElastiCache", description: "Redis / Memcached in-memory cluster", unit: "node", color: "#22d3ee", defaultSize: 1, defaultUtil: 55 },
    { kind: "cdn", label: "CloudFront", description: "Global edge CDN · Price Class 100/200/All", unit: "TB", color: "#94a3b8", defaultSize: 1, defaultUtil: 50 },
    { kind: "queue", label: "SQS / SNS", description: "Standard or FIFO queues & pub/sub topics", unit: "M msg", color: "#eab308", defaultSize: 10, defaultUtil: 40 },
  ],
  gcp: [
    { kind: "vm", label: "Compute Engine", description: "e2 / n2 / c2 VMs · Micro → 2X-Large", unit: "instance", color: "#f5c518", defaultSize: 1, defaultUtil: 48 },
    { kind: "storage", label: "GCS / Persistent Disk", description: "Cloud Storage or PD Balanced / SSD", unit: "GB", color: "#4db8ff", defaultSize: 250, defaultUtil: 60 },
    { kind: "network", label: "Cloud LB / Egress", description: "External HTTP(S) load balancer or egress", unit: "GB / svc", color: "#3dd68c", defaultSize: 200, defaultUtil: 35 },
    { kind: "database", label: "Cloud SQL", description: "Postgres / MySQL · Regional HA or Zonal", unit: "instance", color: "#f472b6", defaultSize: 40, defaultUtil: 50 },
    { kind: "serverless", label: "Cloud Functions", description: "2nd Gen serverless functions · 256MB → 2GB", unit: "M req", color: "#fb923c", defaultSize: 5, defaultUtil: 40 },
    { kind: "container", label: "Cloud Run / GKE", description: "Fully managed containers or GKE Autopilot", unit: "vCPU", color: "#a78bfa", defaultSize: 2, defaultUtil: 45 },
    { kind: "cache", label: "Memorystore", description: "Managed Redis / Memcached · Basic or HA", unit: "node", color: "#22d3ee", defaultSize: 1, defaultUtil: 55 },
    { kind: "cdn", label: "Cloud CDN", description: "Anycast edge cache · Standard or Premium network", unit: "TB", color: "#94a3b8", defaultSize: 1, defaultUtil: 50 },
    { kind: "queue", label: "Cloud Pub/Sub", description: "Global asynchronous messaging & event streams", unit: "M msg", color: "#eab308", defaultSize: 10, defaultUtil: 40 },
  ],
  azure: [
    { kind: "vm", label: "Virtual Machine", description: "B-series / D-series v5 · Micro → 2X-Large", unit: "instance", color: "#f5c518", defaultSize: 1, defaultUtil: 48 },
    { kind: "storage", label: "Blob / Managed Disk", description: "Blob Hot/Cool or Premium SSD Managed Disks", unit: "GB", color: "#4db8ff", defaultSize: 250, defaultUtil: 60 },
    { kind: "network", label: "App Gateway / Egress", description: "Application Gateway v2 WAF or Internet egress", unit: "GB / svc", color: "#3dd68c", defaultSize: 200, defaultUtil: 35 },
    { kind: "database", label: "Azure Database / SQL", description: "Flexible Postgres or Azure SQL · Zone Redundant", unit: "instance", color: "#f472b6", defaultSize: 40, defaultUtil: 50 },
    { kind: "serverless", label: "Azure Functions", description: "Consumption (Y1) or Premium (EP1) hosting", unit: "M req", color: "#fb923c", defaultSize: 5, defaultUtil: 40 },
    { kind: "container", label: "Container Apps / AKS", description: "Serverless Container Apps or managed AKS", unit: "vCPU", color: "#a78bfa", defaultSize: 2, defaultUtil: 45 },
    { kind: "cache", label: "Azure Cache for Redis", description: "Basic C0, Standard C1, or Premium P1 clustering", unit: "node", color: "#22d3ee", defaultSize: 1, defaultUtil: 55 },
    { kind: "cdn", label: "Azure Front Door / CDN", description: "Standard edge or Front Door Premium WAF", unit: "TB", color: "#94a3b8", defaultSize: 1, defaultUtil: 50 },
    { kind: "queue", label: "Service Bus / Queue", description: "Standard queues or Premium partitioned topics", unit: "M msg", color: "#eab308", defaultSize: 10, defaultUtil: 40 },
  ],
};

export const PROVIDER_SKUS: Record<CloudProvider, Partial<Record<ResourceKind, SkuOption[]>>> = {
  aws: {
    vm: [
      { id: "t3.micro", name: "t3.micro", description: "2 vCPU, 1 GB RAM · General Purpose Burstable", tier: "micro" },
      { id: "t3.small", name: "t3.small", description: "2 vCPU, 2 GB RAM · Balanced Burstable", tier: "small" },
      { id: "t3.medium", name: "t3.medium", description: "2 vCPU, 4 GB RAM · General Purpose", tier: "medium" },
      { id: "m5.large", name: "m5.large", description: "2 vCPU, 8 GB RAM · Memory & Compute Balanced", tier: "large" },
      { id: "c5.xlarge", name: "c5.xlarge", description: "4 vCPU, 8 GB RAM · Compute Optimized", tier: "xlarge" },
      { id: "r5.2xlarge", name: "r5.2xlarge", description: "8 vCPU, 64 GB RAM · Memory Optimized", tier: "2xlarge" },
    ],
    storage: [
      { id: "s3_standard", name: "S3 Standard", description: "General purpose high-availability object store", storage_class: "object" },
      { id: "s3_ia", name: "S3 Infrequent Access", description: "Lower storage price, data retrieval fee", storage_class: "object" },
      { id: "ebs_gp3", name: "EBS gp3 SSD", description: "Baseline 3,000 IOPS, 125 MB/s provisioned SSD", storage_class: "block_ssd" },
      { id: "ebs_io2", name: "EBS io2 Block", description: "High-durability 99.999% provisioned IOPS SSD", storage_class: "block_ssd" },
    ],
    serverless: [
      { id: "lambda_128", name: "128 MB Memory", description: "Micro microservices & lightweight webhooks" },
      { id: "lambda_512", name: "512 MB Memory", description: "Standard API endpoints & JSON parsing" },
      { id: "lambda_1024", name: "1024 MB (1 vCPU)", description: "Heavy computation & data processing" },
      { id: "lambda_2048", name: "2048 MB (2 vCPU)", description: "Image transform, ML inference & batch processing" },
    ],
    container: [
      { id: "fargate", name: "AWS Fargate", description: "Serverless container compute engine" },
      { id: "eks_node", name: "EKS Managed Node", description: "Dedicated EC2 instances in an EKS cluster" },
    ],
    cache: [
      { id: "cache.t3.micro", name: "cache.t3.micro", description: "0.5 GB RAM · Dev & testing cache" },
      { id: "cache.t3.medium", name: "cache.t3.medium", description: "3.1 GB RAM · Production small cache" },
      { id: "cache.m5.large", name: "cache.m5.large", description: "6.4 GB RAM · High throughput cluster" },
    ],
    cdn: [
      { id: "price_class_100", name: "Price Class 100", description: "North America and Europe edge locations only" },
      { id: "price_class_200", name: "Price Class 200", description: "NA, Europe, Asia, Africa, and Oceania" },
      { id: "price_class_all", name: "Price Class All", description: "All worldwide CloudFront edge points of presence" },
    ],
    queue: [
      { id: "sqs_standard", name: "SQS Standard", description: "Unlimited throughput, at-least-once delivery" },
      { id: "sqs_fifo", name: "SQS FIFO", description: "Strict ordered processing, exactly-once delivery" },
      { id: "sns_topic", name: "SNS Topic", description: "High-throughput pub/sub push notifications" },
    ],
  },
  gcp: {
    vm: [
      { id: "e2-micro", name: "e2-micro", description: "2 vCPU (burst), 1 GB RAM · Cost-optimized", tier: "micro" },
      { id: "e2-small", name: "e2-small", description: "2 vCPU (burst), 2 GB RAM · Dev/Test", tier: "small" },
      { id: "e2-medium", name: "e2-medium", description: "2 vCPU (burst), 4 GB RAM · Workload baseline", tier: "medium" },
      { id: "n2-standard-4", name: "n2-standard-4", description: "4 vCPU, 16 GB RAM · Production general purpose", tier: "large" },
      { id: "c2-standard-8", name: "c2-standard-8", description: "8 vCPU, 32 GB RAM · Compute-intensive tier", tier: "xlarge" },
      { id: "n2-highmem-16", name: "n2-highmem-16", description: "16 vCPU, 128 GB RAM · Memory-intensive databases", tier: "2xlarge" },
    ],
    storage: [
      { id: "gcs_standard", name: "Cloud Storage Standard", description: "Geo-redundant hot object storage", storage_class: "object" },
      { id: "gcs_nearline", name: "Cloud Storage Nearline", description: "Access < 1x/month, lower at-rest rate", storage_class: "object" },
      { id: "pd_balanced", name: "Persistent Disk Balanced", description: "Solid SSD performance balanced for price", storage_class: "block_ssd" },
      { id: "pd_ssd", name: "Persistent Disk SSD", description: "High IOPS performance enterprise block store", storage_class: "block_ssd" },
    ],
    serverless: [
      { id: "gcf_256", name: "256 MB Memory", description: "Event handlers & webhook receiver functions" },
      { id: "gcf_512", name: "512 MB Memory", description: "Standard REST APIs & auth handlers" },
      { id: "gcf_1024", name: "1 GB Memory (1 vCPU)", description: "ETL transforms & background processing" },
      { id: "gcf_2048", name: "2 GB Memory (2 vCPU)", description: "High-concurrency event pipelines" },
    ],
    container: [
      { id: "cloud_run", name: "Cloud Run", description: "Fully managed serverless container service" },
      { id: "gke_autopilot", name: "GKE Autopilot", description: "Hands-off managed Kubernetes operations" },
      { id: "gke_standard", name: "GKE Standard", description: "Configurable cluster nodes and nodepools" },
    ],
    cache: [
      { id: "memorystore_basic", name: "Memorystore Basic (1 GB)", description: "Zonal standalone Redis instance" },
      { id: "memorystore_ha_5", name: "Memorystore Standard HA (5 GB)", description: "High-availability multi-zone replica" },
      { id: "memorystore_ha_10", name: "Memorystore Standard HA (10 GB)", description: "Large memory caching tier with failover" },
    ],
    cdn: [
      { id: "cdn_standard", name: "Cloud CDN Standard", description: "Standard network tier Anycast caching" },
      { id: "cdn_premium", name: "Cloud CDN Premium", description: "Google backbone global high-performance tier" },
    ],
    queue: [
      { id: "pubsub_standard", name: "Pub/Sub Standard", description: "Global messaging with 100ms delivery guarantee" },
      { id: "cloud_tasks", name: "Cloud Tasks", description: "Asynchronous task queues with rate-limiting" },
    ],
  },
  azure: {
    vm: [
      { id: "Standard_B1s", name: "Standard_B1s", description: "1 vCPU, 1 GB RAM · Economical burstable", tier: "micro" },
      { id: "Standard_B1ms", name: "Standard_B1ms", description: "1 vCPU, 2 GB RAM · Lightweight services", tier: "small" },
      { id: "Standard_B2s", name: "Standard_B2s", description: "2 vCPU, 4 GB RAM · General development", tier: "medium" },
      { id: "Standard_D2s_v5", name: "Standard_D2s_v5", description: "2 vCPU, 8 GB RAM · Production enterprise tier", tier: "large" },
      { id: "Standard_D4s_v5", name: "Standard_D4s_v5", description: "4 vCPU, 16 GB RAM · High-throughput compute", tier: "xlarge" },
      { id: "Standard_D8s_v5", name: "Standard_D8s_v5", description: "8 vCPU, 32 GB RAM · Heavy production workloads", tier: "2xlarge" },
    ],
    storage: [
      { id: "blob_hot", name: "Blob Storage Hot", description: "Active object data with lowest access costs", storage_class: "object" },
      { id: "blob_cool", name: "Blob Storage Cool", description: "Infrequently accessed data stored > 30 days", storage_class: "object" },
      { id: "disk_premium", name: "Premium SSD Disk", description: "High-performance low-latency managed disk", storage_class: "block_ssd" },
      { id: "disk_standard", name: "Standard SSD Disk", description: "Consistent performance for web & dev disks", storage_class: "block_ssd" },
    ],
    serverless: [
      { id: "func_consumption", name: "Consumption Plan (Y1)", description: "Automatic scale-to-zero serverless functions" },
      { id: "func_premium_ep1", name: "Premium EP1 (1 core, 3.5GB)", description: "Always-ready warm instances, VNet integration" },
      { id: "func_dedicated", name: "Dedicated App Service (B1)", description: "Predictable monthly compute boundary" },
    ],
    container: [
      { id: "container_apps", name: "Azure Container Apps", description: "Microservices on serverless Kubernetes" },
      { id: "aks_standard", name: "Azure Kubernetes Service", description: "Enterprise-grade managed Kubernetes nodes" },
    ],
    cache: [
      { id: "redis_basic_c0", name: "Basic C0 (250 MB)", description: "Single-node dev cache" },
      { id: "redis_standard_c1", name: "Standard C1 (1 GB)", description: "Two-node primary/replica with SLA" },
      { id: "redis_premium_p1", name: "Premium P1 (6 GB)", description: "Clustering, persistence, and VNet isolation" },
    ],
    cdn: [
      { id: "cdn_standard_ms", name: "Standard Microsoft CDN", description: "Global edge acceleration with rule engine" },
      { id: "frontdoor_std", name: "Azure Front Door Standard", description: "Integrated CDN, global LB and basic WAF" },
      { id: "frontdoor_prem", name: "Azure Front Door Premium", description: "Advanced security, bot defense & private links" },
    ],
    queue: [
      { id: "sb_standard", name: "Service Bus Standard", description: "Queues and topics with message deduplication" },
      { id: "sb_premium", name: "Service Bus Premium", description: "Dedicated resource isolation & message partitions" },
      { id: "storage_queue", name: "Storage Queue", description: "Simple, highly scalable message store" },
    ],
  },
};

export const PROVIDER_ENGINES: Record<CloudProvider, { id: string; label: string }[]> = {
  aws: [
    { id: "postgres", label: "PostgreSQL" },
    { id: "mysql", label: "MySQL" },
    { id: "aurora-postgresql", label: "Amazon Aurora (PostgreSQL)" },
    { id: "aurora-mysql", label: "Amazon Aurora (MySQL)" },
  ],
  gcp: [
    { id: "postgres", label: "Cloud SQL for PostgreSQL" },
    { id: "mysql", label: "Cloud SQL for MySQL" },
  ],
  azure: [
    { id: "postgres", label: "PostgreSQL Flexible Server" },
    { id: "azure-sql", label: "Azure SQL Database" },
    { id: "mysql", label: "MySQL Flexible Server" },
  ],
};

export function catalogFor(provider: CloudProvider): CatalogItem[] {
  return PROVIDER_CATALOG[provider] ?? PROVIDER_CATALOG.aws;
}

export function kindLabel(kind: ResourceKind, provider: CloudProvider = "aws"): string {
  return (PROVIDER_CATALOG[provider] ?? PROVIDER_CATALOG.aws).find((item) => item.kind === kind)?.label ?? kind;
}

export function skusFor(provider: CloudProvider, kind: ResourceKind): SkuOption[] {
  return PROVIDER_SKUS[provider]?.[kind] ?? [];
}

export function enginesFor(provider: CloudProvider): { id: string; label: string }[] {
  return PROVIDER_ENGINES[provider] ?? PROVIDER_ENGINES.aws;
}

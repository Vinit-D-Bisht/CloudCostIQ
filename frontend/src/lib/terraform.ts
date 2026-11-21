import type { CloudProvider, ResourceConfig } from "./sim";
import { sanitizeResource } from "./sim";

export interface TerraformValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks_run: number;
}

function safeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "") || "resource";
}

function tagsBlock(indent = "  "): string {
  return `${indent}tags = {\n${indent}  Environment = "Simulation"\n${indent}  ManagedBy   = "CloudCostIQ"\n${indent}}`;
}

function awsBlock(resource: ResourceConfig): string {
  const id = safeId(resource.name);
  const tier = resource.tier ?? "small";
  const instanceType =
    resource.sku && resource.sku.startsWith("t3.") || resource.sku?.startsWith("m5.") || resource.sku?.startsWith("c5.") || resource.sku?.startsWith("r5.")
      ? resource.sku
      : {
          micro: "t3.micro",
          small: "t3.small",
          medium: "t3.medium",
          large: "m5.large",
          xlarge: "c5.xlarge",
          "2xlarge": "r5.2xlarge",
        }[tier] ?? "t3.small";

  if (resource.kind === "vm") {
    return `resource "aws_instance" "${id}" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "${instanceType}"
  count         = ${resource.quantity}
${tagsBlock()}
}`;
  }

  if (resource.kind === "storage") {
    if (resource.storage_class === "block_ssd") {
      const volType = resource.sku?.includes("io2") ? "io2" : "gp3";
      return `resource "aws_ebs_volume" "${id}" {
  availability_zone = "us-east-1a"
  size              = ${Math.max(1, Math.round(resource.size))}
  type              = "${volType}"
${tagsBlock()}
}`;
    }
    return `resource "aws_s3_bucket" "${id}" {
  bucket        = "${id}-cloudcostiq"
  force_destroy = true
${tagsBlock()}
}`;
  }

  if (resource.kind === "network") {
    if (resource.network_service === "alb") {
      return `resource "aws_lb" "${id}" {
  name               = "${id}"
  internal           = false
  load_balancer_type = "application"
${tagsBlock()}
}`;
    }
    return `# Modeled data egress for ${resource.name}: ${resource.size} GB/mo (metered transfer, no standalone provisioned resource)`;
  }

  if (resource.kind === "database") {
    const engine = resource.engine?.includes("mysql") ? "mysql" : "postgres";
    return `resource "aws_db_instance" "${id}" {
  identifier           = "${id}"
  allocated_storage    = ${Math.max(20, Math.round(resource.size))}
  engine               = "${engine}"
  instance_class       = "db.${instanceType}"
  multi_az             = ${resource.db_ha === "multi_az"}
  skip_final_snapshot  = true
${tagsBlock()}
}`;
  }

  if (resource.kind === "serverless") {
    return `resource "aws_lambda_function" "${id}" {
  function_name = "${id}"
  role          = "arn:aws:iam::123456789012:role/cloudcostiq-sim"
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = "placeholder.zip"
  memory_size   = 512
${tagsBlock()}
}`;
  }

  if (resource.kind === "container") {
    return `resource "aws_ecs_cluster" "${id}" {
  name = "${id}"
${tagsBlock()}
}

resource "aws_ecs_task_definition" "${id}_task" {
  family                   = "${id}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "${Math.max(256, Math.round(resource.size * 512))}"
  memory                   = "${Math.max(512, Math.round(resource.size * 1024))}"
${tagsBlock()}
}`;
  }

  if (resource.kind === "cache") {
    const cacheNodeType = resource.sku?.startsWith("cache.") ? resource.sku : "cache.t3.micro";
    return `resource "aws_elasticache_cluster" "${id}" {
  cluster_id           = "${id}"
  engine               = "redis"
  node_type            = "${cacheNodeType}"
  num_cache_nodes      = ${resource.quantity}
  parameter_group_name = "default.redis7"
${tagsBlock()}
}`;
  }

  if (resource.kind === "cdn") {
    return `resource "aws_cloudfront_distribution" "${id}" {
  enabled     = true
  price_class = "PriceClass_100"
  origin {
    domain_name = "example.s3.amazonaws.com"
    origin_id   = "${id}-origin"
  }
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "${id}-origin"
    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
${tagsBlock()}
}`;
  }

  // queue
  const isFifo = resource.sku?.includes("fifo");
  const queueName = isFifo ? `${id}.fifo` : id;
  return `resource "aws_sqs_queue" "${id}" {
  name       = "${queueName}"
  fifo_queue = ${isFifo ? "true" : "false"}
${tagsBlock()}
}`;
}

function gcpBlock(resource: ResourceConfig): string {
  const id = safeId(resource.name);
  const tier = resource.tier ?? "small";
  const machine =
    resource.sku?.startsWith("e2-") || resource.sku?.startsWith("n2-") || resource.sku?.startsWith("c2-")
      ? resource.sku
      : {
          micro: "e2-micro",
          small: "e2-small",
          medium: "e2-medium",
          large: "n2-standard-4",
          xlarge: "c2-standard-8",
          "2xlarge": "n2-highmem-16",
        }[tier] ?? "e2-small";

  if (resource.kind === "vm") {
    return `resource "google_compute_instance" "${id}" {
  name         = "${resource.name}"
  machine_type = "${machine}"
  zone         = "us-central1-a"
  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
    }
  }
  network_interface {
    network = "default"
  }
  labels = {
    environment = "simulation"
    managed_by  = "cloudcostiq"
  }
}`;
  }

  if (resource.kind === "storage") {
    if (resource.storage_class === "block_ssd") {
      return `resource "google_compute_disk" "${id}" {
  name = "${id}-disk"
  type = "pd-ssd"
  zone = "us-central1-a"
  size = ${Math.max(10, Math.round(resource.size))}
  labels = {
    environment = "simulation"
    managed_by  = "cloudcostiq"
  }
}`;
    }
    return `resource "google_storage_bucket" "${id}" {
  name     = "${id}-cloudcostiq"
  location = "US"
  labels = {
    environment = "simulation"
    managed_by  = "cloudcostiq"
  }
}`;
  }

  if (resource.kind === "network") {
    if (resource.network_service === "alb") {
      return `resource "google_compute_global_forwarding_rule" "${id}" {
  name       = "${id}-lb"
  ip_protocol = "TCP"
  port_range = "80"
  target     = "google_compute_target_http_proxy.${id}_proxy.id"
}`;
    }
    return `# Modeled Premium Tier network egress for ${resource.name}: ${resource.size} GB/mo across GCP backbone`;
  }

  if (resource.kind === "database") {
    const isMultiAz = resource.db_ha === "multi_az";
    const dbTier = tier === "large" || tier === "xlarge" || tier === "2xlarge" ? "db-custom-4-15360" : "db-f1-micro";
    return `resource "google_sql_database_instance" "${id}" {
  name             = "${id}"
  database_version = "POSTGRES_15"
  region           = "us-central1"
  settings {
    tier              = "${dbTier}"
    availability_type = "${isMultiAz ? "REGIONAL" : "ZONAL"}"
  }
}`;
  }

  if (resource.kind === "serverless") {
    return `resource "google_cloudfunctions2_function" "${id}" {
  name     = "${id}"
  location = "us-central1"
  build_config {
    runtime     = "nodejs20"
    entry_point = "handler"
  }
  service_config {
    available_memory = "512M"
  }
}`;
  }

  if (resource.kind === "container") {
    return `resource "google_cloud_run_v2_service" "${id}" {
  name     = "${id}"
  location = "us-central1"
  template {
    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"
      resources {
        limits = {
          cpu    = "${Math.max(1, Math.round(resource.size))}"
          memory = "${Math.max(1, Math.round(resource.size * 2))}Gi"
        }
      }
    }
  }
}`;
  }

  if (resource.kind === "cache") {
    const isHa = resource.db_ha === "multi_az" || resource.service_tier?.includes("HA");
    return `resource "google_redis_instance" "${id}" {
  name           = "${id}"
  tier           = "${isHa ? "STANDARD_HA" : "BASIC"}"
  memory_size_gb = ${Math.max(1, Math.round(resource.size))}
  region         = "us-central1"
}`;
  }

  if (resource.kind === "cdn") {
    return `resource "google_compute_backend_bucket" "${id}" {
  name        = "${id}-cdn"
  bucket_name = "${id}-cloudcostiq"
  enable_cdn  = true
}`;
  }

  // queue
  return `resource "google_pubsub_topic" "${id}" {
  name = "${id}"
  labels = {
    environment = "simulation"
    managed_by  = "cloudcostiq"
  }
}`;
}

function azureBlock(resource: ResourceConfig): string {
  const id = safeId(resource.name);
  const tier = resource.tier ?? "small";
  const size =
    resource.sku?.startsWith("Standard_")
      ? resource.sku
      : {
          micro: "Standard_B1s",
          small: "Standard_B1ms",
          medium: "Standard_B2s",
          large: "Standard_D2s_v5",
          xlarge: "Standard_D4s_v5",
          "2xlarge": "Standard_D8s_v5",
        }[tier] ?? "Standard_B1ms";

  if (resource.kind === "vm") {
    return `resource "azurerm_linux_virtual_machine" "${id}" {
  name                = "${resource.name}"
  resource_group_name = azurerm_resource_group.sim.name
  location            = azurerm_resource_group.sim.location
  size                = "${size}"
  admin_username      = "azureuser"
  network_interface_ids = []
  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }
  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts"
    version   = "latest"
  }
${tagsBlock()}
}`;
  }

  if (resource.kind === "storage") {
    if (resource.storage_class === "block_ssd") {
      return `resource "azurerm_managed_disk" "${id}" {
  name                 = "${id}-disk"
  location             = azurerm_resource_group.sim.location
  resource_group_name  = azurerm_resource_group.sim.name
  storage_account_type = "Premium_LRS"
  create_option        = "Empty"
  disk_size_gb         = ${Math.max(1, Math.round(resource.size))}
${tagsBlock()}
}`;
    }
    return `resource "azurerm_storage_account" "${id}" {
  name                     = "${id.replace(/_/g, "").slice(0, 24)}"
  resource_group_name      = azurerm_resource_group.sim.name
  location                 = azurerm_resource_group.sim.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
${tagsBlock()}
}`;
  }

  if (resource.kind === "network") {
    if (resource.network_service === "alb") {
      return `resource "azurerm_application_gateway" "${id}" {
  name                = "${id}-appgw"
  resource_group_name = azurerm_resource_group.sim.name
  location            = azurerm_resource_group.sim.location
  sku {
    name     = "Standard_v2"
    tier     = "Standard_v2"
    capacity = ${resource.quantity}
  }
${tagsBlock()}
}`;
    }
    return `# Modeled Internet egress for ${resource.name}: ${resource.size} GB/mo via Azure Public IP`;
  }

  if (resource.kind === "database") {
    const isMultiAz = resource.db_ha === "multi_az";
    const dbSku = tier === "large" || tier === "xlarge" || tier === "2xlarge" ? "GP_Standard_D2ds_v5" : "B_Standard_B1ms";
    return `resource "azurerm_postgresql_flexible_server" "${id}" {
  name                   = "${id}"
  resource_group_name    = azurerm_resource_group.sim.name
  location               = azurerm_resource_group.sim.location
  version                = "15"
  sku_name               = "${dbSku}"
  storage_mb             = ${Math.max(32768, Math.round(resource.size) * 1024)}
  administrator_login    = "psqladmin"
  administrator_password = "ChangeMe-SimOnly!"
  high_availability {
    mode = "${isMultiAz ? "ZoneRedundant" : "Disabled"}"
  }
${tagsBlock()}
}`;
  }

  if (resource.kind === "serverless") {
    return `resource "azurerm_linux_function_app" "${id}" {
  name                = "${id}"
  resource_group_name = azurerm_resource_group.sim.name
  location            = azurerm_resource_group.sim.location
  service_plan_id     = "plan-placeholder"
  site_config {}
${tagsBlock()}
}`;
  }

  if (resource.kind === "container") {
    return `resource "azurerm_container_app" "${id}" {
  name                         = "${id}"
  container_app_environment_id = "env-placeholder"
  resource_group_name          = azurerm_resource_group.sim.name
  template {
    container {
      name   = "app"
      image  = "mcr.microsoft.com/azuredocs/aci-helloworld:latest"
      cpu    = 0.5
      memory = "1Gi"
    }
  }
${tagsBlock()}
}`;
  }

  if (resource.kind === "cache") {
    return `resource "azurerm_redis_cache" "${id}" {
  name                = "${id}"
  location            = azurerm_resource_group.sim.location
  resource_group_name = azurerm_resource_group.sim.name
  capacity            = 1
  family              = "C"
  sku_name            = "Standard"
${tagsBlock()}
}`;
  }

  if (resource.kind === "cdn") {
    return `resource "azurerm_cdn_profile" "${id}" {
  name                = "${id}-cdn"
  location            = azurerm_resource_group.sim.location
  resource_group_name = azurerm_resource_group.sim.name
  sku                 = "Standard_Microsoft"
${tagsBlock()}
}`;
  }

  // queue
  const isPremium = resource.sku?.includes("premium");
  return `resource "azurerm_servicebus_namespace" "${id}" {
  name                = "${id}"
  location            = azurerm_resource_group.sim.location
  resource_group_name = azurerm_resource_group.sim.name
  sku                 = "${isPremium ? "Premium" : "Standard"}"
${tagsBlock()}
}`;
}

export function generateTerraform(resources: ResourceConfig[], provider: CloudProvider): string {
  const clean = resources.map(sanitizeResource);
  const header =
    provider === "aws"
      ? `# CloudCost IQ simulation output — review only, never auto-applied.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}
provider "aws" { region = "us-east-1" }

`
      : provider === "gcp"
        ? `# CloudCost IQ simulation output — review only, never auto-applied.
terraform {
  required_providers {
    google = { source = "hashicorp/google", version = "~> 5.0" }
  }
}
provider "google" { project = "cloudcostiq-sim" region = "us-central1" }

`
        : `# CloudCost IQ simulation output — review only, never auto-applied.
terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 3.0" }
  }
}
provider "azurerm" { features {} }
resource "azurerm_resource_group" "sim" {
  name     = "cloudcostiq-sim"
  location = "eastus"
  tags = { Environment = "Simulation", ManagedBy = "CloudCostIQ" }
}

`;

  const blocks = clean.map((resource) => {
    if (provider === "aws") return awsBlock(resource);
    if (provider === "gcp") return gcpBlock(resource);
    return azureBlock(resource);
  });
  return header + blocks.join("\n\n") + "\n";
}

export function validateTerraform(
  resources: ResourceConfig[],
  provider: CloudProvider,
  hcl?: string,
): TerraformValidation {
  const errors: string[] = [];
  const warnings: string[] = [
    "CloudCostIQ performs basic rule checks only; Terraform CLI validation was not run.",
    "Generated HCL is an illustrative template, not confirmed deployment-ready infrastructure.",
  ];
  const clean = resources.map(sanitizeResource);
  const names = clean.map((r) => r.name.trim().toLowerCase());

  if (!clean.length) errors.push("Add at least one resource before validating.");
  if (names.some((n) => !n)) errors.push("Resource names cannot be empty.");
  if (new Set(names).size !== names.length) errors.push("Resource names must be unique.");

  for (const resource of clean) {
    if (!["aws", "gcp", "azure"].includes(provider)) {
      errors.push(`Unsupported provider: ${provider}`);
      break;
    }
    if (resource.kind === "vm" && !resource.tier) warnings.push(`${resource.name}: missing instance tier.`);
    if (resource.kind === "storage" && resource.storage_class === "block_ssd" && resource.size < 1) {
      errors.push(`${resource.name}: block SSD size must be >= 1 GB.`);
    }
    if (resource.kind === "vm" && resource.utilization < 25 && (resource.tier === "large" || resource.tier === "xlarge" || resource.tier === "2xlarge")) {
      warnings.push(`${resource.name} looks over-provisioned for its utilization.`);
    }
  }

  const text = hcl ?? generateTerraform(clean, provider);
  const opens = (text.match(/\{/g) || []).length;
  const closes = (text.match(/\}/g) || []).length;
  if (opens !== closes) errors.push("Unbalanced HCL blocks detected.");
  const placeholders: Record<string, string> = {
    "placeholder.zip": "Lambda deployment ZIP is a placeholder.",
    "plan-placeholder": "Azure Function service plan ID is a placeholder.",
    "env-placeholder": "Azure Container Apps environment ID is a placeholder.",
    "ChangeMe-SimOnly!": "Azure database password is a simulation placeholder; replace it with a secure secret.",
    "network_interface_ids = []": "Azure VM has no network interface configured.",
    "123456789012:role/cloudcostiq-sim": "AWS Lambda IAM role ARN is an example placeholder.",
  };
  for (const [marker, warning] of Object.entries(placeholders)) {
    if (text.includes(marker)) warnings.push(warning);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks_run: 6,
  };
}

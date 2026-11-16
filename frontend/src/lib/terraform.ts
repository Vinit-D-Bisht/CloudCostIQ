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
    {
      micro: "t3.micro",
      small: "t3.small",
      medium: "t3.medium",
      large: "t3.large",
      xlarge: "t3.xlarge",
      "2xlarge": "t3.2xlarge",
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
      return `resource "aws_ebs_volume" "${id}" {
  availability_zone = "us-east-1a"
  size              = ${Math.max(1, Math.round(resource.size))}
  type              = "gp3"
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
    return `# Modeled egress for ${resource.name}: ${resource.size} GB/mo (no standalone AWS resource)`;
  }
  if (resource.kind === "database") {
    return `resource "aws_db_instance" "${id}" {
  identifier           = "${id}"
  allocated_storage    = ${Math.max(20, Math.round(resource.size))}
  engine               = "postgres"
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
${tagsBlock()}
}`;
  }
  if (resource.kind === "container") {
    return `resource "aws_ecs_cluster" "${id}" {
  name = "${id}"
${tagsBlock()}
}`;
  }
  if (resource.kind === "cache") {
    return `resource "aws_elasticache_cluster" "${id}" {
  cluster_id           = "${id}"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = ${resource.quantity}
  parameter_group_name = "default.redis7"
${tagsBlock()}
}`;
  }
  if (resource.kind === "cdn") {
    return `resource "aws_cloudfront_distribution" "${id}" {
  enabled = true
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
  if (resource.kind === "queue") {
    return `resource "aws_sqs_queue" "${id}" {
  name = "${id}"
${tagsBlock()}
}`;
  }
  return `# Unsupported AWS kind for ${resource.name}`;
}

function gcpBlock(resource: ResourceConfig): string {
  const id = safeId(resource.name);
  const machine =
    {
      micro: "e2-micro",
      small: "e2-small",
      medium: "e2-medium",
      large: "e2-standard-4",
      xlarge: "e2-standard-8",
      "2xlarge": "e2-standard-16",
    }[resource.tier ?? "small"] ?? "e2-small";

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
    return `resource "google_storage_bucket" "${id}" {
  name     = "${id}-cloudcostiq"
  location = "US"
  labels = {
    environment = "simulation"
    managed_by  = "cloudcostiq"
  }
}`;
  }
  if (resource.kind === "database") {
    return `resource "google_sql_database_instance" "${id}" {
  name             = "${id}"
  database_version = "POSTGRES_15"
  region           = "us-central1"
  settings {
    tier = "db-f1-micro"
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
    available_memory = "256M"
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
    }
  }
}`;
  }
  if (resource.kind === "cache") {
    return `resource "google_redis_instance" "${id}" {
  name           = "${id}"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = "us-central1"
}`;
  }
  if (resource.kind === "cdn") {
    return `# Cloud CDN modeled for ${resource.name} (attach to backend bucket/service)`;
  }
  if (resource.kind === "queue") {
    return `resource "google_pubsub_topic" "${id}" {
  name = "${id}"
}`;
  }
  return `# GCP network model for ${resource.name}`;
}

function azureBlock(resource: ResourceConfig): string {
  const id = safeId(resource.name);
  const size =
    {
      micro: "Standard_B1s",
      small: "Standard_B1ms",
      medium: "Standard_B2s",
      large: "Standard_D2s_v3",
      xlarge: "Standard_D4s_v3",
      "2xlarge": "Standard_D8s_v3",
    }[resource.tier ?? "small"] ?? "Standard_B1ms";

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
  tags = {
    Environment = "Simulation"
    ManagedBy   = "CloudCostIQ"
  }
}`;
  }
  if (resource.kind === "storage") {
    return `resource "azurerm_storage_account" "${id}" {
  name                     = "${id.replace(/_/g, "").slice(0, 24)}"
  resource_group_name      = azurerm_resource_group.sim.name
  location                 = azurerm_resource_group.sim.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  tags = {
    Environment = "Simulation"
    ManagedBy   = "CloudCostIQ"
  }
}`;
  }
  if (resource.kind === "database") {
    return `resource "azurerm_postgresql_flexible_server" "${id}" {
  name                   = "${id}"
  resource_group_name    = azurerm_resource_group.sim.name
  location               = azurerm_resource_group.sim.location
  version                = "15"
  sku_name               = "B_Standard_B1ms"
  storage_mb             = ${Math.max(32768, Math.round(resource.size) * 1024)}
  administrator_login    = "psqladmin"
  administrator_password = "ChangeMe-SimOnly!"
  tags = {
    Environment = "Simulation"
    ManagedBy   = "CloudCostIQ"
  }
}`;
  }
  if (resource.kind === "serverless") {
    return `resource "azurerm_linux_function_app" "${id}" {
  name                = "${id}"
  resource_group_name = azurerm_resource_group.sim.name
  location            = azurerm_resource_group.sim.location
  service_plan_id     = "plan-placeholder"
  site_config {}
  tags = { Environment = "Simulation", ManagedBy = "CloudCostIQ" }
}`;
  }
  if (resource.kind === "container") {
    return `resource "azurerm_kubernetes_cluster" "${id}" {
  name                = "${id}"
  location            = azurerm_resource_group.sim.location
  resource_group_name = azurerm_resource_group.sim.name
  dns_prefix          = "${id}"
  default_node_pool {
    name       = "default"
    node_count = ${resource.quantity}
    vm_size    = "Standard_B2s"
  }
  identity { type = "SystemAssigned" }
  tags = { Environment = "Simulation", ManagedBy = "CloudCostIQ" }
}`;
  }
  if (resource.kind === "cache") {
    return `resource "azurerm_redis_cache" "${id}" {
  name                = "${id}"
  location            = azurerm_resource_group.sim.location
  resource_group_name = azurerm_resource_group.sim.name
  capacity            = 0
  family              = "C"
  sku_name            = "Basic"
  tags = { Environment = "Simulation", ManagedBy = "CloudCostIQ" }
}`;
  }
  if (resource.kind === "cdn") {
    return `# Azure CDN / Front Door modeled for ${resource.name}`;
  }
  if (resource.kind === "queue") {
    return `resource "azurerm_servicebus_namespace" "${id}" {
  name                = "${id}"
  location            = azurerm_resource_group.sim.location
  resource_group_name = azurerm_resource_group.sim.name
  sku                 = "Basic"
  tags = { Environment = "Simulation", ManagedBy = "CloudCostIQ" }
}`;
  }
  return `# Azure network model for ${resource.name}`;
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
  const warnings: string[] = [];
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

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks_run: 6,
  };
}

"""Multi-provider Terraform HCL generation and lightweight validation."""

from __future__ import annotations

import re
from typing import Any

AWS_TYPES = {
    "micro": "t3.micro",
    "small": "t3.small",
    "medium": "t3.medium",
    "large": "m5.large",
    "xlarge": "c5.xlarge",
    "2xlarge": "r5.2xlarge",
}
GCP_TYPES = {
    "micro": "e2-micro",
    "small": "e2-small",
    "medium": "e2-medium",
    "large": "n2-standard-4",
    "xlarge": "c2-standard-8",
    "2xlarge": "n2-highmem-16",
}
AZURE_TYPES = {
    "micro": "Standard_B1s",
    "small": "Standard_B1ms",
    "medium": "Standard_B2s",
    "large": "Standard_D2s_v5",
    "xlarge": "Standard_D4s_v5",
    "2xlarge": "Standard_D8s_v5",
}


def _safe_id(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_]", "_", str(name).lower())
    cleaned = re.sub(r"^_+|_\+$", "", cleaned)
    return cleaned or "resource"


def _tags(indent: str = "  ") -> str:
    return (
        f'{indent}tags = {{\n'
        f'{indent}  Environment = "Simulation"\n'
        f'{indent}  ManagedBy   = "CloudCostIQ"\n'
        f'{indent}}}'
    )


def _as_dict(resource: Any) -> dict[str, Any]:
    return resource.model_dump() if hasattr(resource, "model_dump") else dict(resource)


def _aws(resource: dict[str, Any]) -> str:
    rid = _safe_id(resource["name"])
    tier = resource.get("tier") or "small"
    sku = str(resource.get("sku") or "")
    if sku.startswith(("t3.", "m5.", "c5.", "r5.")):
        itype = sku
    else:
        itype = AWS_TYPES.get(tier, "t3.small")
    kind = resource["kind"]

    if kind == "vm":
        return (
            f'resource "aws_instance" "{rid}" {{\n'
            f'  ami           = "ami-0c55b159cbfafe1f0"\n'
            f'  instance_type = "{itype}"\n'
            f'  count         = {resource.get("quantity", 1)}\n'
            f'{_tags()}\n}}'
        )
    if kind == "storage":
        if resource.get("storage_class") == "block_ssd":
            vol_type = "io2" if "io2" in sku else "gp3"
            return (
                f'resource "aws_ebs_volume" "{rid}" {{\n'
                f'  availability_zone = "us-east-1a"\n'
                f'  size              = {max(1, round(float(resource.get("size", 1))))}\n'
                f'  type              = "{vol_type}"\n'
                f'{_tags()}\n}}'
            )
        return (
            f'resource "aws_s3_bucket" "{rid}" {{\n'
            f'  bucket        = "{rid}-cloudcostiq"\n'
            f'  force_destroy = true\n'
            f'{_tags()}\n}}'
        )
    if kind == "network":
        if resource.get("network_service") == "alb":
            return (
                f'resource "aws_lb" "{rid}" {{\n'
                f'  name               = "{rid}"\n'
                f'  internal           = false\n'
                f'  load_balancer_type = "application"\n'
                f'{_tags()}\n}}'
            )
        return f'# Modeled data egress for {resource["name"]}: {resource.get("size", 0)} GB/mo (metered transfer, no standalone provisioned resource)'
    if kind == "database":
        engine = "mysql" if "mysql" in str(resource.get("engine", "")).lower() else "postgres"
        multi_az = "true" if resource.get("db_ha") == "multi_az" else "false"
        return (
            f'resource "aws_db_instance" "{rid}" {{\n'
            f'  identifier           = "{rid}"\n'
            f'  allocated_storage    = {max(20, round(float(resource.get("size", 20))))}\n'
            f'  engine               = "{engine}"\n'
            f'  instance_class       = "db.{itype}"\n'
            f'  multi_az             = {multi_az}\n'
            f'  skip_final_snapshot  = true\n'
            f'{_tags()}\n}}'
        )
    if kind == "serverless":
        return (
            f'resource "aws_lambda_function" "{rid}" {{\n'
            f'  function_name = "{rid}"\n'
            f'  role          = "arn:aws:iam::123456789012:role/cloudcostiq-sim"\n'
            f'  handler       = "index.handler"\n'
            f'  runtime       = "nodejs20.x"\n'
            f'  filename      = "placeholder.zip"\n'
            f'  memory_size   = 512\n'
            f'{_tags()}\n}}'
        )
    if kind == "container":
        cpu = max(256, round(float(resource.get("size", 1)) * 512))
        mem = max(512, round(float(resource.get("size", 1)) * 1024))
        return (
            f'resource "aws_ecs_cluster" "{rid}" {{\n'
            f'  name = "{rid}"\n'
            f'{_tags()}\n}}\n\n'
            f'resource "aws_ecs_task_definition" "{rid}_task" {{\n'
            f'  family                   = "{rid}-task"\n'
            f'  network_mode             = "awsvpc"\n'
            f'  requires_compatibilities = ["FARGATE"]\n'
            f'  cpu                      = "{cpu}"\n'
            f'  memory                   = "{mem}"\n'
            f'{_tags()}\n}}'
        )
    if kind == "cache":
        node_type = sku if sku.startswith("cache.") else "cache.t3.micro"
        return (
            f'resource "aws_elasticache_cluster" "{rid}" {{\n'
            f'  cluster_id           = "{rid}"\n'
            f'  engine               = "redis"\n'
            f'  node_type            = "{node_type}"\n'
            f'  num_cache_nodes      = {resource.get("quantity", 1)}\n'
            f'  parameter_group_name = "default.redis7"\n'
            f'{_tags()}\n}}'
        )
    if kind == "cdn":
        return (
            f'resource "aws_cloudfront_distribution" "{rid}" {{\n'
            f'  enabled     = true\n'
            f'  price_class = "PriceClass_100"\n'
            f'  origin {{\n'
            f'    domain_name = "example.s3.amazonaws.com"\n'
            f'    origin_id   = "{rid}-origin"\n'
            f'  }}\n'
            f'  default_cache_behavior {{\n'
            f'    allowed_methods        = ["GET", "HEAD"]\n'
            f'    cached_methods         = ["GET", "HEAD"]\n'
            f'    target_origin_id       = "{rid}-origin"\n'
            f'    viewer_protocol_policy = "redirect-to-https"\n'
            f'    forwarded_values {{\n'
            f'      query_string = false\n'
            f'      cookies {{ forward = "none" }}\n'
            f'    }}\n'
            f'  }}\n'
            f'  restrictions {{\n'
            f'    geo_restriction {{ restriction_type = "none" }}\n'
            f'  }}\n'
            f'  viewer_certificate {{ cloudfront_default_certificate = true }}\n'
            f'{_tags()}\n}}'
        )
    # queue
    is_fifo = "fifo" in sku
    qname = f"{rid}.fifo" if is_fifo else rid
    return (
        f'resource "aws_sqs_queue" "{rid}" {{\n'
        f'  name       = "{qname}"\n'
        f'  fifo_queue = {"true" if is_fifo else "false"}\n'
        f'{_tags()}\n}}'
    )


def _gcp(resource: dict[str, Any]) -> str:
    rid = _safe_id(resource["name"])
    tier = resource.get("tier") or "small"
    sku = str(resource.get("sku") or "")
    if sku.startswith(("e2-", "n2-", "c2-")):
        machine = sku
    else:
        machine = GCP_TYPES.get(tier, "e2-small")
    kind = resource["kind"]

    if kind == "vm":
        return (
            f'resource "google_compute_instance" "{rid}" {{\n'
            f'  name         = "{resource["name"]}"\n'
            f'  machine_type = "{machine}"\n'
            f'  zone         = "us-central1-a"\n'
            f'  boot_disk {{\n    initialize_params {{ image = "debian-cloud/debian-12" }}\n  }}\n'
            f'  network_interface {{ network = "default" }}\n'
            f'  labels = {{ environment = "simulation", managed_by = "cloudcostiq" }}\n}}'
        )
    if kind == "storage":
        if resource.get("storage_class") == "block_ssd":
            return (
                f'resource "google_compute_disk" "{rid}" {{\n'
                f'  name = "{rid}-disk"\n'
                f'  type = "pd-ssd"\n'
                f'  zone = "us-central1-a"\n'
                f'  size = {max(10, round(float(resource.get("size", 10))))}\n'
                f'  labels = {{ environment = "simulation", managed_by = "cloudcostiq" }}\n}}'
            )
        return (
            f'resource "google_storage_bucket" "{rid}" {{\n'
            f'  name     = "{rid}-cloudcostiq"\n'
            f'  location = "US"\n'
            f'  labels = {{ environment = "simulation", managed_by = "cloudcostiq" }}\n}}'
        )
    if kind == "network":
        if resource.get("network_service") == "alb":
            return (
                f'resource "google_compute_global_forwarding_rule" "{rid}" {{\n'
                f'  name        = "{rid}-lb"\n'
                f'  ip_protocol = "TCP"\n'
                f'  port_range  = "80"\n'
                f'  target      = "google_compute_target_http_proxy.{rid}_proxy.id"\n}}'
            )
        return f'# Modeled Premium Tier network egress for {resource["name"]}: {resource.get("size", 0)} GB/mo across GCP backbone'
    if kind == "database":
        db_tier = "db-custom-4-15360" if tier in {"large", "xlarge", "2xlarge"} else "db-f1-micro"
        avail = "REGIONAL" if resource.get("db_ha") == "multi_az" else "ZONAL"
        return (
            f'resource "google_sql_database_instance" "{rid}" {{\n'
            f'  name             = "{rid}"\n'
            f'  database_version = "POSTGRES_15"\n'
            f'  region           = "us-central1"\n'
            f'  settings {{\n'
            f'    tier              = "{db_tier}"\n'
            f'    availability_type = "{avail}"\n'
            f'  }}\n}}'
        )
    if kind == "serverless":
        return (
            f'resource "google_cloudfunctions2_function" "{rid}" {{\n'
            f'  name     = "{rid}"\n'
            f'  location = "us-central1"\n'
            f'  build_config {{\n'
            f'    runtime     = "nodejs20"\n'
            f'    entry_point = "handler"\n'
            f'  }}\n'
            f'  service_config {{\n'
            f'    available_memory = "512M"\n'
            f'  }}\n}}'
        )
    if kind == "container":
        cpu = max(1, round(float(resource.get("size", 1))))
        mem = max(1, round(float(resource.get("size", 1)) * 2))
        return (
            f'resource "google_cloud_run_v2_service" "{rid}" {{\n'
            f'  name     = "{rid}"\n'
            f'  location = "us-central1"\n'
            f'  template {{\n'
            f'    containers {{\n'
            f'      image = "us-docker.pkg.dev/cloudrun/container/hello"\n'
            f'      resources {{\n'
            f'        limits = {{\n'
            f'          cpu    = "{cpu}"\n'
            f'          memory = "{mem}Gi"\n'
            f'        }}\n'
            f'      }}\n'
            f'    }}\n'
            f'  }}\n}}'
        )
    if kind == "cache":
        is_ha = resource.get("db_ha") == "multi_az" or "ha" in str(resource.get("service_tier", "")).lower()
        tier_str = "STANDARD_HA" if is_ha else "BASIC"
        mem_gb = max(1, round(float(resource.get("size", 1))))
        return (
            f'resource "google_redis_instance" "{rid}" {{\n'
            f'  name           = "{rid}"\n'
            f'  tier           = "{tier_str}"\n'
            f'  memory_size_gb = {mem_gb}\n'
            f'  region         = "us-central1"\n}}'
        )
    if kind == "cdn":
        return (
            f'resource "google_compute_backend_bucket" "{rid}" {{\n'
            f'  name        = "{rid}-cdn"\n'
            f'  bucket_name = "{rid}-cloudcostiq"\n'
            f'  enable_cdn  = true\n}}'
        )
    # queue
    return (
        f'resource "google_pubsub_topic" "{rid}" {{\n'
        f'  name   = "{rid}"\n'
        f'  labels = {{ environment = "simulation", managed_by = "cloudcostiq" }}\n}}'
    )


def _azure(resource: dict[str, Any]) -> str:
    rid = _safe_id(resource["name"])
    tier = resource.get("tier") or "small"
    sku = str(resource.get("sku") or "")
    if sku.startswith("Standard_"):
        size = sku
    else:
        size = AZURE_TYPES.get(tier, "Standard_B1ms")
    kind = resource["kind"]

    if kind == "vm":
        return (
            f'resource "azurerm_linux_virtual_machine" "{rid}" {{\n'
            f'  name                = "{resource["name"]}"\n'
            f'  resource_group_name = azurerm_resource_group.sim.name\n'
            f'  location            = azurerm_resource_group.sim.location\n'
            f'  size                = "{size}"\n'
            f'  admin_username      = "azureuser"\n'
            f'  network_interface_ids = []\n'
            f'  os_disk {{\n'
            f'    caching              = "ReadWrite"\n'
            f'    storage_account_type = "Standard_LRS"\n'
            f'  }}\n'
            f'  source_image_reference {{\n'
            f'    publisher = "Canonical"\n'
            f'    offer     = "0001-com-ubuntu-server-jammy"\n'
            f'    sku       = "22_04-lts"\n'
            f'    version   = "latest"\n'
            f'  }}\n'
            f'{_tags()}\n}}'
        )
    if kind == "storage":
        if resource.get("storage_class") == "block_ssd":
            return (
                f'resource "azurerm_managed_disk" "{rid}" {{\n'
                f'  name                 = "{rid}-disk"\n'
                f'  location             = azurerm_resource_group.sim.location\n'
                f'  resource_group_name  = azurerm_resource_group.sim.name\n'
                f'  storage_account_type = "Premium_LRS"\n'
                f'  create_option        = "Empty"\n'
                f'  disk_size_gb         = {max(1, round(float(resource.get("size", 1))))}\n'
                f'{_tags()}\n}}'
            )
        account = rid.replace("_", "")[:24] or "cloudcostiq"
        return (
            f'resource "azurerm_storage_account" "{rid}" {{\n'
            f'  name                     = "{account}"\n'
            f'  resource_group_name      = azurerm_resource_group.sim.name\n'
            f'  location                 = azurerm_resource_group.sim.location\n'
            f'  account_tier             = "Standard"\n'
            f'  account_replication_type = "LRS"\n'
            f'{_tags()}\n}}'
        )
    if kind == "network":
        if resource.get("network_service") == "alb":
            return (
                f'resource "azurerm_application_gateway" "{rid}" {{\n'
                f'  name                = "{rid}-appgw"\n'
                f'  resource_group_name = azurerm_resource_group.sim.name\n'
                f'  location            = azurerm_resource_group.sim.location\n'
                f'  sku {{\n'
                f'    name     = "Standard_v2"\n'
                f'    tier     = "Standard_v2"\n'
                f'    capacity = {resource.get("quantity", 1)}\n'
                f'  }}\n'
                f'{_tags()}\n}}'
            )
        return f'# Modeled Internet egress for {resource["name"]}: {resource.get("size", 0)} GB/mo via Azure Public IP'
    if kind == "database":
        db_sku = "GP_Standard_D2ds_v5" if tier in {"large", "xlarge", "2xlarge"} else "B_Standard_B1ms"
        ha_mode = "ZoneRedundant" if resource.get("db_ha") == "multi_az" else "Disabled"
        return (
            f'resource "azurerm_postgresql_flexible_server" "{rid}" {{\n'
            f'  name                   = "{rid}"\n'
            f'  resource_group_name    = azurerm_resource_group.sim.name\n'
            f'  location               = azurerm_resource_group.sim.location\n'
            f'  version                = "15"\n'
            f'  sku_name               = "{db_sku}"\n'
            f'  storage_mb             = {max(32768, round(float(resource.get("size", 20)) * 1024))}\n'
            f'  administrator_login    = "psqladmin"\n'
            f'  administrator_password = "ChangeMe-SimOnly!"\n'
            f'  high_availability {{\n'
            f'    mode = "{ha_mode}"\n'
            f'  }}\n'
            f'{_tags()}\n}}'
        )
    if kind == "serverless":
        return (
            f'resource "azurerm_linux_function_app" "{rid}" {{\n'
            f'  name                = "{rid}"\n'
            f'  resource_group_name = azurerm_resource_group.sim.name\n'
            f'  location            = azurerm_resource_group.sim.location\n'
            f'  service_plan_id     = "plan-placeholder"\n'
            f'  site_config {{}}\n'
            f'{_tags()}\n}}'
        )
    if kind == "container":
        return (
            f'resource "azurerm_container_app" "{rid}" {{\n'
            f'  name                         = "{rid}"\n'
            f'  container_app_environment_id = "env-placeholder"\n'
            f'  resource_group_name          = azurerm_resource_group.sim.name\n'
            f'  template {{\n'
            f'    container {{\n'
            f'      name   = "app"\n'
            f'      image  = "mcr.microsoft.com/azuredocs/aci-helloworld:latest"\n'
            f'      cpu    = 0.5\n'
            f'      memory = "1Gi"\n'
            f'    }}\n'
            f'  }}\n'
            f'{_tags()}\n}}'
        )
    if kind == "cache":
        return (
            f'resource "azurerm_redis_cache" "{rid}" {{\n'
            f'  name                = "{rid}"\n'
            f'  location            = azurerm_resource_group.sim.location\n'
            f'  resource_group_name = azurerm_resource_group.sim.name\n'
            f'  capacity            = 1\n'
            f'  family              = "C"\n'
            f'  sku_name            = "Standard"\n'
            f'{_tags()}\n}}'
        )
    if kind == "cdn":
        return (
            f'resource "azurerm_cdn_profile" "{rid}" {{\n'
            f'  name                = "{rid}-cdn"\n'
            f'  location            = azurerm_resource_group.sim.location\n'
            f'  resource_group_name = azurerm_resource_group.sim.name\n'
            f'  sku                 = "Standard_Microsoft"\n'
            f'{_tags()}\n}}'
        )
    # queue
    is_prem = "premium" in sku
    return (
        f'resource "azurerm_servicebus_namespace" "{rid}" {{\n'
        f'  name                = "{rid}"\n'
        f'  location            = azurerm_resource_group.sim.location\n'
        f'  resource_group_name = azurerm_resource_group.sim.name\n'
        f'  sku                 = "{"Premium" if is_prem else "Standard"}"\n'
        f'{_tags()}\n}}'
    )


def generate(resources: list[Any], provider: str = "aws") -> str:
    provider = provider if provider in {"aws", "gcp", "azure"} else "aws"
    rows = [_as_dict(item) for item in resources]
    if provider == "aws":
        header = (
            "# CloudCost IQ simulation output — review only, never auto-applied.\n"
            "terraform {\n  required_providers {\n"
            '    aws = { source = "hashicorp/aws", version = "~> 5.0" }\n  }\n}\n'
            'provider "aws" { region = "us-east-1" }\n\n'
        )
        body = "\n\n".join(_aws(item) for item in rows)
    elif provider == "gcp":
        header = (
            "# CloudCost IQ simulation output — review only, never auto-applied.\n"
            "terraform {\n  required_providers {\n"
            '    google = { source = "hashicorp/google", version = "~> 5.0" }\n  }\n}\n'
            'provider "google" { project = "cloudcostiq-sim" region = "us-central1" }\n\n'
        )
        body = "\n\n".join(_gcp(item) for item in rows)
    else:
        header = (
            "# CloudCost IQ simulation output — review only, never auto-applied.\n"
            "terraform {\n  required_providers {\n"
            '    azurerm = { source = "hashicorp/azurerm", version = "~> 3.0" }\n  }\n}\n'
            'provider "azurerm" { features {} }\n'
            'resource "azurerm_resource_group" "sim" {\n'
            '  name     = "cloudcostiq-sim"\n'
            '  location = "eastus"\n'
            '  tags = { Environment = "Simulation", ManagedBy = "CloudCostIQ" }\n}\n\n'
        )
        body = "\n\n".join(_azure(item) for item in rows)
    return header + body + "\n"


def validate(resources: list[Any], provider: str = "aws", hcl: str | None = None) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = [
        "CloudCostIQ performs basic rule checks only; Terraform CLI validation was not run.",
        "Generated HCL is an illustrative template, not confirmed deployment-ready infrastructure.",
    ]
    rows = [_as_dict(item) for item in resources]
    names = [str(item.get("name", "")).strip().lower() for item in rows]

    if not rows:
        errors.append("Add at least one resource before validating.")
    if any(not name for name in names):
        errors.append("Resource names cannot be empty.")
    if len(names) != len(set(names)):
        errors.append("Resource names must be unique.")
    if provider not in {"aws", "gcp", "azure"}:
        errors.append(f"Unsupported provider: {provider}")

    for item in rows:
        if item.get("kind") == "vm" and not item.get("tier"):
            warnings.append(f'{item.get("name", "resource")}: missing instance tier.')
        if item.get("kind") == "storage" and item.get("storage_class") == "block_ssd" and float(item.get("size", 0)) < 1:
            errors.append(f'{item.get("name", "resource")}: block SSD size must be >= 1 GB.')
        if (
            item.get("kind") == "vm"
            and float(item.get("utilization", 100)) < 25
            and item.get("tier") in {"large", "xlarge", "2xlarge"}
        ):
            warnings.append(f'{item.get("name", "resource")} looks over-provisioned for its utilization.')

    text = hcl if hcl is not None else generate(resources, provider)
    if text.count("{") != text.count("}"):
        errors.append("Unbalanced HCL blocks detected.")
    placeholders = {
        "placeholder.zip": "Lambda deployment ZIP is a placeholder.",
        "plan-placeholder": "Azure Function service plan ID is a placeholder.",
        "env-placeholder": "Azure Container Apps environment ID is a placeholder.",
        "ChangeMe-SimOnly!": "Azure database password is a simulation placeholder; replace it with a secure secret.",
        "network_interface_ids = []": "Azure VM has no network interface configured.",
        "123456789012:role/cloudcostiq-sim": "AWS Lambda IAM role ARN is an example placeholder.",
    }
    for marker, warning in placeholders.items():
        if marker in text:
            warnings.append(warning)

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "checks_run": 6,
    }

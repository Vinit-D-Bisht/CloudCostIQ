"""Multi-provider Terraform HCL generation and lightweight validation."""

from __future__ import annotations

from typing import Any

AWS_TYPES = {
    "micro": "t3.micro",
    "small": "t3.small",
    "medium": "t3.medium",
    "large": "t3.large",
    "xlarge": "t3.xlarge",
    "2xlarge": "t3.2xlarge",
}
GCP_TYPES = {
    "micro": "e2-micro",
    "small": "e2-small",
    "medium": "e2-medium",
    "large": "e2-standard-4",
    "xlarge": "e2-standard-8",
    "2xlarge": "e2-standard-16",
}
AZURE_TYPES = {
    "micro": "Standard_B1s",
    "small": "Standard_B1ms",
    "medium": "Standard_B2s",
    "large": "Standard_D2s_v3",
    "xlarge": "Standard_D4s_v3",
    "2xlarge": "Standard_D8s_v3",
}


def _safe_id(name: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in name.lower())
    return cleaned.strip("_") or "resource"


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
    itype = AWS_TYPES.get(tier, "t3.small")
    kind = resource["kind"]
    if kind == "vm":
        return (
            f'resource "aws_instance" "{rid}" {{\n'
            f'  ami           = "ami-0c55b159cbfafe1f0"\n'
            f'  instance_type = "{itype}"\n'
            f'  count         = {resource["quantity"]}\n'
            f'{_tags()}\n}}'
        )
    if kind == "storage":
        if resource.get("storage_class") == "block_ssd":
            return (
                f'resource "aws_ebs_volume" "{rid}" {{\n'
                f'  availability_zone = "us-east-1a"\n'
                f'  size              = {max(1, round(resource["size"]))}\n'
                f'  type              = "gp3"\n'
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
        return f'# Modeled egress for {resource["name"]}: {resource["size"]} GB/mo'
    return (
        f'resource "aws_db_instance" "{rid}" {{\n'
        f'  identifier          = "{rid}"\n'
        f'  allocated_storage   = {max(20, round(resource["size"]))}\n'
        f'  engine              = "postgres"\n'
        f'  instance_class      = "db.{itype}"\n'
        f'  multi_az            = {"true" if resource.get("db_ha") == "multi_az" else "false"}\n'
        f'  skip_final_snapshot = true\n'
        f'{_tags()}\n}}'
    )


def _gcp(resource: dict[str, Any]) -> str:
    rid = _safe_id(resource["name"])
    machine = GCP_TYPES.get(resource.get("tier") or "small", "e2-small")
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
        return (
            f'resource "google_storage_bucket" "{rid}" {{\n'
            f'  name     = "{rid}-cloudcostiq"\n'
            f'  location = "US"\n'
            f'  labels = {{ environment = "simulation", managed_by = "cloudcostiq" }}\n}}'
        )
    if kind == "database":
        return (
            f'resource "google_sql_database_instance" "{rid}" {{\n'
            f'  name             = "{rid}"\n'
            f'  database_version = "POSTGRES_15"\n'
            f'  region           = "us-central1"\n'
            f'  settings {{ tier = "db-f1-micro" }}\n}}'
        )
    return f'# GCP network model for {resource["name"]}'


def _azure(resource: dict[str, Any]) -> str:
    rid = _safe_id(resource["name"])
    size = AZURE_TYPES.get(resource.get("tier") or "small", "Standard_B1ms")
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
            f'  os_disk {{ caching = "ReadWrite" storage_account_type = "Standard_LRS" }}\n'
            f'  source_image_reference {{\n'
            f'    publisher = "Canonical"\n'
            f'    offer     = "0001-com-ubuntu-server-jammy"\n'
            f'    sku       = "22_04-lts"\n'
            f'    version   = "latest"\n  }}\n'
            f'{_tags()}\n}}'
        )
    if kind == "storage":
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
    if kind == "database":
        return (
            f'resource "azurerm_postgresql_flexible_server" "{rid}" {{\n'
            f'  name                = "{rid}"\n'
            f'  resource_group_name = azurerm_resource_group.sim.name\n'
            f'  location            = azurerm_resource_group.sim.location\n'
            f'  version             = "15"\n'
            f'  sku_name            = "B_Standard_B1ms"\n'
            f'  storage_mb          = {max(32768, round(resource["size"]) * 1024)}\n'
            f'  administrator_login = "psqladmin"\n'
            f'  administrator_password = "ChangeMe-SimOnly!"\n'
            f'{_tags()}\n}}'
        )
    return f'# Azure network model for {resource["name"]}'


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
    warnings: list[str] = []
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
        if item["kind"] == "storage" and item.get("storage_class") == "block_ssd" and item.get("size", 0) < 1:
            errors.append(f'{item["name"]}: block SSD size must be >= 1 GB.')
        if (
            item["kind"] == "vm"
            and item.get("utilization", 100) < 25
            and item.get("tier") in {"large", "xlarge", "2xlarge"}
        ):
            warnings.append(f'{item["name"]} looks over-provisioned for its utilization.')

    text = hcl if hcl is not None else generate(resources, provider)
    if text.count("{") != text.count("}"):
        errors.append("Unbalanced HCL blocks detected.")

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "checks_run": 6,
    }

import unittest
from lib.terraform_gen import generate, validate

KINDS = ["vm", "storage", "network", "database", "serverless", "container", "cache", "cdn", "queue"]

class TestTerraform(unittest.TestCase):
    def test_terraform_all_providers_nine_kinds(self):
        resources = [
            {"id": f"res-{k}", "name": f"name_{k}", "kind": k, "quantity": 1, "size": 10, "utilization": 50, "tier": "small"}
            for k in KINDS
        ]
        for provider in ["aws", "gcp", "azure"]:
            hcl = generate(resources, provider=provider)
            self.assertGreater(len(hcl), 100)
            val = validate(resources, provider=provider, hcl=hcl)
            self.assertTrue(val["valid"], f"Terraform validation failed for {provider}: {val['errors']}")
            self.assertGreaterEqual(val["checks_run"], 6)

    def test_terraform_unbalanced_braces_fails(self):
        bad_hcl = 'resource "aws_instance" "foo" { ami = "bar"'
        val = validate([{"id": "1", "name": "foo", "kind": "vm", "tier": "small"}], provider="aws", hcl=bad_hcl)
        self.assertFalse(val["valid"])
        self.assertTrue(any("Unbalanced" in err for err in val["errors"]))

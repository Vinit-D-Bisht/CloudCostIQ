import unittest
from fastapi.testclient import TestClient
from server import app

class TestApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app, raise_server_exceptions=False)

    def test_health_endpoint(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("service"), "cloudcostiq")

    def test_simulation_analyze(self):
        payload = {
            "resources": [
                {"id": "1", "name": "web", "kind": "vm", "quantity": 2, "size": 1, "utilization": 50, "tier": "small"}
            ],
            "workload": 50,
            "hours_per_month": 730,
            "provider": "aws",
            "pricing_model": "on_demand",
            "region": "us-east"
        }
        resp = self.client.post("/api/simulation/analyze", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreater(data["total_monthly_cost"], 0)
        self.assertEqual(len(data["resource_estimates"]), 1)

    def test_recommendations_fallback(self):
        payload = {
            "resources": [
                {"id": "1", "name": "staging-vm", "kind": "vm", "quantity": 1, "size": 1, "utilization": 15, "tier": "large", "environment": "non_production"}
            ],
            "simulation": {
                "total_monthly_cost": 280.0,
                "projected_annual_cost": 3360.0,
                "estimated_savings": 200.0,
                "utilization_score": 15,
                "resource_estimates": [
                    {"resource_id": "1", "monthly_cost": 280.0, "unit_cost": 280.0, "utilization": 15, "status": "idle", "scales_with_workload": False}
                ],
                "by_kind": {"vm": 280.0},
                "generated_at": "2026-11-16T12:00:00Z"
            },
            "provider": "aws",
            "pricing_model": "on_demand",
            "region": "us-east",
            "workload": 50
        }
        resp = self.client.post("/api/recommendations", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn(data["provider"], ["gemini", "deterministic"])
        self.assertGreaterEqual(len(data["recommendations"]), 1)

    def test_terraform_generate_and_validate(self):
        payload = {
            "resources": [
                {"id": "1", "name": "app_db", "kind": "database", "quantity": 1, "size": 50, "utilization": 60, "tier": "medium", "db_ha": "multi_az"}
            ],
            "provider": "aws"
        }
        resp = self.client.post("/api/terraform/generate", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("aws_db_instance", data["configuration"])

        val_resp = self.client.post("/api/terraform/validate", json=payload)
        self.assertEqual(val_resp.status_code, 200)
        val_data = val_resp.json()
        self.assertTrue(val_data["valid"])

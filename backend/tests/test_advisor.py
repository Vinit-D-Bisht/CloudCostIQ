import unittest
from lib.sim import analyze
from lib.advisor import rule_recommendations

class TestAdvisor(unittest.TestCase):
    def test_advisor_rules_detection(self):
        resources = [
            {"id": "1", "name": "staging-vm", "kind": "vm", "tier": "large", "quantity": 1, "size": 1, "utilization": 15, "environment": "non_production"},
            {"id": "2", "name": "dev-db", "kind": "database", "tier": "large", "quantity": 1, "size": 50, "utilization": 20, "db_ha": "multi_az", "environment": "non_production"},
            {"id": "3", "name": "idle-cache", "kind": "cache", "quantity": 1, "size": 1, "utilization": 10, "environment": "production"},
            {"id": "4", "name": "oversized-app", "kind": "container", "quantity": 1, "size": 8, "utilization": 20, "environment": "production"},
            {"id": "5", "name": "heavy-egress", "kind": "network", "quantity": 1, "size": 2500, "utilization": 70, "network_service": "egress", "environment": "production"},
            {"id": "6", "name": "prod-vm", "kind": "vm", "tier": "medium", "quantity": 2, "size": 1, "utilization": 65, "environment": "production"},
        ]
        sim = analyze(resources, workload=60, hours_per_month=730, provider="aws")
        recs = rule_recommendations(resources, sim, pricing_model="on_demand")

        self.assertGreaterEqual(len(recs), 4)
        # Ensure Spot is recommended for non_prod but NEVER for production
        spot_recs = [r for r in recs if "Spot" in r["title"]]
        self.assertTrue(any("staging-vm" in r["title"] for r in spot_recs))
        self.assertFalse(any("prod-vm" in r["title"] for r in spot_recs))

        # Ensure every recommendation contains title, rationale, action, savings, risk
        for r in recs:
            self.assertIn("Problem:", r["rationale"])
            self.assertIn("Why it matters:", r["rationale"])
            self.assertIn("Action:", r["rationale"])
            self.assertGreaterEqual(r["estimated_monthly_saving"], 0)
            self.assertIsNotNone(r["risk"])

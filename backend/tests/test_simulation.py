import unittest
from lib.sim import analyze, sanitize_resource

KINDS = ["vm", "storage", "network", "database", "serverless", "container", "cache", "cdn", "queue"]

class TestSimulation(unittest.TestCase):
    def test_sanitize_resource(self):
        res = sanitize_resource({"id": "1", "name": "  test-res  ", "kind": "vm", "quantity": 0, "size": 0.5, "utilization": 150})
        self.assertEqual(res["name"], "test-res")
        self.assertEqual(res["quantity"], 1)
        self.assertEqual(res["size"], 0.5)
        self.assertEqual(res["utilization"], 100)
        self.assertEqual(res["tier"], "small")

    def test_all_nine_kinds_simulated_aws(self):
        resources = [
            {"id": f"res-{k}", "name": f"name-{k}", "kind": k, "quantity": 1, "size": 10, "utilization": 50}
            for k in KINDS
        ]
        out = analyze(resources, workload=50, hours_per_month=730, provider="aws")
        self.assertGreater(out["total_monthly_cost"], 0)
        self.assertEqual(out["projected_annual_cost"], round(out["total_monthly_cost"] * 12, 2))
        self.assertEqual(len(out["resource_estimates"]), 9)
        for k in KINDS:
            self.assertIn(k, out["by_kind"])

    def test_pricing_model_multipliers(self):
        res = [{"id": "1", "name": "vm1", "kind": "vm", "tier": "medium", "quantity": 1, "size": 1, "utilization": 50}]
        od = analyze(res, workload=50, hours_per_month=730, provider="aws", pricing_model="on_demand")
        r1 = analyze(res, workload=50, hours_per_month=730, provider="aws", pricing_model="reserved_1y")
        r3 = analyze(res, workload=50, hours_per_month=730, provider="aws", pricing_model="reserved_3y")
        spot = analyze(res, workload=50, hours_per_month=730, provider="aws", pricing_model="spot")

        self.assertGreater(od["total_monthly_cost"], r1["total_monthly_cost"])
        self.assertGreater(r1["total_monthly_cost"], r3["total_monthly_cost"])
        self.assertGreater(r3["total_monthly_cost"], spot["total_monthly_cost"])

    def test_fixed_vs_scaling_invariants(self):
        vm_low = analyze([{"id": "1", "name": "vm", "kind": "vm", "tier": "small", "quantity": 1, "size": 1, "utilization": 20}], workload=10, hours_per_month=730)
        vm_high = analyze([{"id": "1", "name": "vm", "kind": "vm", "tier": "small", "quantity": 1, "size": 1, "utilization": 20}], workload=90, hours_per_month=730)
        self.assertEqual(vm_low["total_monthly_cost"], vm_high["total_monthly_cost"])

        net_low = analyze([{"id": "2", "name": "net", "kind": "network", "quantity": 1, "size": 500, "utilization": 20, "network_service": "egress"}], workload=10, hours_per_month=730)
        net_high = analyze([{"id": "2", "name": "net", "kind": "network", "quantity": 1, "size": 500, "utilization": 20, "network_service": "egress"}], workload=90, hours_per_month=730)
        self.assertGreater(net_high["total_monthly_cost"], net_low["total_monthly_cost"])

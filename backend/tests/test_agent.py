import asyncio
import unittest

from lib.agent import TOOL_DEFINITIONS, execute_tool, run_tool_agent, serialize_tool_result
from models.cloudcost import (
    RecommendationRequest,
    ResourceConfig,
    ResourceEstimate,
    SimulationResponse,
)


def sample_request():
    resource = ResourceConfig(
        id="vm-1",
        name="staging-vm",
        kind="vm",
        quantity=1,
        size=1,
        utilization=15,
        tier="large",
        environment="non_production",
    )
    simulation = SimulationResponse(
        total_monthly_cost=100,
        projected_annual_cost=1200,
        estimated_savings=35,
        utilization_score=15,
        resource_estimates=[
            ResourceEstimate(
                resource_id="vm-1",
                monthly_cost=100,
                unit_cost=100,
                utilization=15,
                status="idle",
            )
        ],
        by_kind={"vm": 100},
    )
    return RecommendationRequest(
        resources=[resource],
        simulation=simulation,
        provider="aws",
        pricing_model="on_demand",
        region="us-east",
        workload=50,
    )


class TestAgentTools(unittest.TestCase):
    def test_registry_contains_only_read_only_workspace_tools(self):
        names = {item["function"]["name"] for item in TOOL_DEFINITIONS}
        self.assertEqual(
            names,
            {
                "analyze_current_simulation",
                "get_optimization_recommendations",
                "generate_terraform_preview",
                "validate_terraform_preview",
            },
        )

    def test_analyze_tool_uses_current_scenario(self):
        result = execute_tool("analyze_current_simulation", {}, sample_request())
        self.assertEqual(result["tool"], "analyze_current_simulation")
        self.assertIn("total_monthly_cost", result["result"])
        self.assertEqual(len(result["result"]["resource_estimates"]), 1)

    def test_recommendation_tool_uses_existing_rules(self):
        result = execute_tool("get_optimization_recommendations", {}, sample_request())
        self.assertEqual(result["tool"], "get_optimization_recommendations")
        self.assertTrue(any("staging-vm" in item["title"] for item in result["result"]))

    def test_terraform_tools_are_preview_only(self):
        request = sample_request()
        generated = execute_tool("generate_terraform_preview", {}, request)
        self.assertIn("aws_instance", generated["result"]["configuration_preview"])
        self.assertIn("configuration_truncated", generated["result"])
        self.assertIn("Preview only", generated["result"]["notice"])

        validated = execute_tool("validate_terraform_preview", {}, request)
        self.assertIn("validation_scope", validated["result"])
        self.assertIn("not Terraform CLI", validated["result"]["validation_scope"])

    def test_tools_reject_arguments_and_unknown_names(self):
        request = sample_request()
        with self.assertRaises(ValueError):
            execute_tool("analyze_current_simulation", {"command": "rm -rf /"}, request)
        with self.assertRaises(ValueError):
            execute_tool("arbitrary_python", {}, request)

    def test_tool_output_is_json_serializable(self):
        result = execute_tool("analyze_current_simulation", {}, sample_request())
        serialized = serialize_tool_result(result)
        self.assertIn('"total_monthly_cost"', serialized)


def test_agent_executes_tool_then_returns_final_answer(monkeypatch):
    class FakeResponse:
        def __init__(self, body):
            self.body = body

        def raise_for_status(self):
            return None

        def json(self):
            return self.body

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.calls = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            self.calls.append(json)
            if len(self.calls) == 1:
                return FakeResponse({
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [{
                                "id": "call-analysis-1",
                                "type": "function",
                                "function": {
                                    "name": "analyze_current_simulation",
                                    "arguments": "{}",
                                },
                            }],
                        }
                    }]
                })

            assert any(message["role"] == "tool" for message in json["messages"])
            return FakeResponse({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "The scenario was recalculated successfully.",
                    }
                }]
            })

    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr("lib.agent.httpx.AsyncClient", FakeClient)

    reply, tools_used = asyncio.run(run_tool_agent(
        sample_request(),
        [{"role": "user", "content": "Recalculate my monthly cost."}],
        {"provider": "aws", "context": "test"},
    ))

    assert reply == "The scenario was recalculated successfully."
    assert tools_used == ["analyze_current_simulation"]


if __name__ == "__main__":
    unittest.main()

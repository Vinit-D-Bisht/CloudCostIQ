import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter

from lib.advisor import rule_recommendations
from lib.db import db
from models.cloudcost import Recommendation, RecommendationRequest, RecommendationResponse

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

SYSTEM_PROMPT = (
    "You are CloudCost IQ, a precise cloud cost optimization coach. "
    "Return only JSON with a recommendations array of 3-5 prioritized items. "
    "Each item must include title, rationale, estimated_monthly_saving as a number, "
    "priority (low, medium, or high), and action. Use only the supplied simulation data. "
    "Never claim a real cloud resource was changed."
)


def deterministic(request: RecommendationRequest) -> list[Recommendation]:
    rows = rule_recommendations(request.resources, request.simulation, request.pricing_model)
    return [Recommendation.model_validate(item) for item in rows]


def parse_recommendations(content: str) -> list[Recommendation]:
    cleaned = content.replace("```json", "").replace("```", "").strip()
    data = json.loads(cleaned)
    items = data["recommendations"] if isinstance(data, dict) else data
    return [Recommendation.model_validate(item) for item in items[:5]]


async def call_ollama(request: RecommendationRequest) -> list[Recommendation]:
    """Prefer native Ollama /api/generate to avoid OpenAI-compat quirks on free VMs."""
    base = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")
    payload = {
        "model": model,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0, "num_predict": 512},
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Context JSON:\n{json.dumps({'resources': [r.model_dump() for r in request.resources], 'simulation': request.simulation.model_dump(mode='json'), 'provider': request.provider, 'region': request.region, 'pricing_model': request.pricing_model, 'workload': request.workload})}"
        ),
    }
    # Short timeouts protect free-tier Oracle VMs and keep the UI responsive.
    timeout = httpx.Timeout(connect=1.0, read=6.0, write=2.0, pool=1.5)
    async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
        response = await client.post(f"{base}/api/generate", json=payload)
        response.raise_for_status()
        content = response.json().get("response", "")
        return parse_recommendations(str(content))


async def call_free_api(request: RecommendationRequest) -> list[Recommendation]:
    """OpenAI-compatible backup (OpenRouter / Groq / etc.) used when Ollama is offline."""
    api_key = os.environ.get("FREE_AI_API_KEY")
    if not api_key:
        raise RuntimeError("FREE_AI_API_KEY not configured")
    base = os.environ.get("FREE_AI_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
    model = os.environ.get("FREE_AI_MODEL", "openrouter/free")
    endpoint = base if base.endswith("/chat/completions") else f"{base}/chat/completions"
    payload = {
        "model": model,
        "temperature": 0,
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "resources": [r.model_dump() for r in request.resources],
                        "simulation": request.simulation.model_dump(mode="json"),
                        "provider": request.provider,
                        "region": request.region,
                        "pricing_model": request.pricing_model,
                        "workload": request.workload,
                    }
                ),
            },
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    # OpenRouter optional identity headers (ignored by other providers).
    referer = os.environ.get("FREE_AI_HTTP_REFERER") or os.environ.get("FRONTEND_URL", "http://localhost:3000")
    title = os.environ.get("FREE_AI_APP_TITLE", "CloudCost IQ")
    headers["HTTP-Referer"] = referer
    headers["X-Title"] = title

    timeout = httpx.Timeout(connect=1.2, read=8.0, write=3.0, pool=2.0)
    async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
        response = await client.post(endpoint, json=payload, headers=headers)
        response.raise_for_status()
        content: Any = response.json()["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(str(part.get("text", "")) for part in content)
        return parse_recommendations(str(content))


def _free_ai_enabled() -> bool:
    """Backup is on when a key is present, unless ENABLE_FREE_AI=false."""
    if not os.environ.get("FREE_AI_API_KEY"):
        return False
    return os.environ.get("ENABLE_FREE_AI", "true").lower() in {"1", "true", "yes", "on"}


async def generate_recommendations(request: RecommendationRequest) -> tuple[str, list[Recommendation]]:
    # Chain: Ollama (primary) → free OpenAI-compatible API (backup) → deterministic rules.
    try:
        return "ollama", await call_ollama(request)
    except Exception:
        pass

    if _free_ai_enabled():
        try:
            return "free_api", await call_free_api(request)
        except Exception:
            pass

    return "deterministic", deterministic(request)


@router.post("", response_model=RecommendationResponse)
async def get_recommendations(input: RecommendationRequest) -> RecommendationResponse:
    provider, recommendations = await generate_recommendations(input)
    response = RecommendationResponse(provider=provider, recommendations=recommendations)
    try:
        await db.recommendations.insert_one(
            {
                "provider": provider,
                "recommendations": [item.model_dump() for item in recommendations],
                "created_at": datetime.now(timezone.utc),
            }
        )
    except Exception:
        pass
    return response

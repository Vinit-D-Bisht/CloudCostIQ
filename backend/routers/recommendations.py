import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter

from lib.advisor import rule_recommendations
from lib.db import db
from models.cloudcost import (
    AdvisorChatRequest,
    AdvisorChatResponse,
    Recommendation,
    RecommendationRequest,
    RecommendationResponse,
)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

RECOMMENDATION_PROMPT = """You are a cloud cost analyst. Analyze only the supplied simulation; do not invent cloud metrics, prices, or savings. Return JSON only: {"recommendations":[...]}. Return 3-5 prioritized items, each with title, rationale, situation (what the supplied data shows), benefits (array of concrete benefits), tradeoffs (array of risks/downsides), estimated_monthly_saving (number; use 0 when unknown), priority (low|medium|high), and action (specific next step). Clearly label savings as estimates. Never claim resources were changed. If no issue is supported by the data, say so and recommend monitoring instead."""


def deterministic(request: RecommendationRequest) -> list[Recommendation]:
    rows = rule_recommendations(request.resources, request.simulation, request.pricing_model)
    result = []
    for item in rows:
        rationale = item["rationale"]
        parts = rationale.split(" Why it matters: ")
        situation = parts[0].removeprefix("Problem: ").strip()
        benefits = [parts[1].split(" Action:")[0].strip()] if len(parts) > 1 else []
        tradeoffs = [item["risk"]] if item.get("risk") else []
        result.append(Recommendation.model_validate({**item, "situation": situation, "benefits": benefits, "tradeoffs": tradeoffs}))
    return result


def parse_recommendations(content: str) -> list[Recommendation]:
    cleaned = content.replace("```json", "").replace("```", "").strip()
    data = json.loads(cleaned)
    items = data["recommendations"] if isinstance(data, dict) else data
    return [Recommendation.model_validate(item) for item in items[:5]]


def _context(request: RecommendationRequest) -> dict[str, Any]:
    return {
        "resources": [resource.model_dump() for resource in request.resources],
        "simulation": request.simulation.model_dump(mode="json"),
        "provider": request.provider,
        "region": request.region,
        "pricing_model": request.pricing_model,
        "workload": request.workload,
    }


async def call_gemini(request: RecommendationRequest) -> list[Recommendation]:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "system_instruction": {"parts": [{"text": RECOMMENDATION_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": json.dumps(_context(request))}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1, "maxOutputTokens": 1600},
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=3, read=25, write=5, pool=2), trust_env=False) as client:
        response = await client.post(url, headers={"x-goog-api-key": api_key}, json=payload)
        response.raise_for_status()
        content = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        return parse_recommendations(content)


async def generate_recommendations(request: RecommendationRequest) -> tuple[str, list[Recommendation]]:
    try:
        return "gemini", await call_gemini(request)
    except Exception:
        return "deterministic", deterministic(request)


@router.post("", response_model=RecommendationResponse)
async def get_recommendations(input: RecommendationRequest) -> RecommendationResponse:
    provider, recommendations = await generate_recommendations(input)
    response = RecommendationResponse(provider=provider, recommendations=recommendations)
    try:
        await db.recommendations.insert_one({
            "provider": provider,
            "recommendations": [item.model_dump() for item in recommendations],
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        pass
    return response


@router.post("/chat", response_model=AdvisorChatResponse)
async def advisor_chat(input: AdvisorChatRequest) -> AdvisorChatResponse:
    api_key = os.environ.get("GROQ_API_KEY")
    if api_key:
        system = (
            "You are CloudCost IQ, a real conversational cloud cost analyst. Answer the latest message directly, "
            "using only this simulated workspace context. Explain what is happening, concrete next steps, and pros/cons "
            "when relevant. Distinguish estimates from actual bills. Never invent data or claim to change infrastructure. "
            "If asked about something absent from context, say what is missing.\nWorkspace context: "
            + json.dumps(_context(input))
        )
        messages = [{"role": "system", "content": system}]
        messages.extend({"role": message.role, "content": message.content} for message in input.messages[-12:])
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(connect=3, read=30, write=5, pool=2), trust_env=False) as client:
                response = await client.post(
                    os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/") + "/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b"), "temperature": 0.3, "messages": messages},
                )
                response.raise_for_status()
                reply = str(response.json()["choices"][0]["message"]["content"]).strip()
                if reply:
                    return AdvisorChatResponse(reply=reply, provider="groq")
        except Exception:
            pass

    return AdvisorChatResponse(
        reply="The live chat model is not configured or is temporarily unavailable. Set GROQ_API_KEY in backend/.env and restart the backend to enable conversational answers. You can still run the deterministic recommendations for this simulation.",
        provider="deterministic",
    )

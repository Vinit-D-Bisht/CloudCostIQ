import json
import logging
import os
from datetime import datetime, timezone
from uuid import uuid4
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from lib import auth as auth_lib
from lib.agent import run_tool_agent
from lib.advisor import rule_recommendations
from lib.db import db
from models.cloudcost import (
    AdvisorChatHistoryResponse,
    AdvisorChatRequest,
    AdvisorChatResponse,
    Recommendation,
    RecommendationRequest,
    RecommendationResponse,
)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])
logger = logging.getLogger(__name__)

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
        "hours_per_month": request.hours_per_month,
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
        logger.exception("Gemini recommendations failed; using deterministic advisor")
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
        logger.exception("Could not persist recommendation record")
    return response



def _history_messages(document: dict[str, Any]) -> list[dict[str, Any]]:
    messages = []
    for item in document.get("messages", [])[-40:]:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str):
            messages.append({
                "role": role,
                "content": content,
                **({"tools_used": item["tools_used"]} if item.get("tools_used") else {}),
            })
    return messages


@router.get("/chat/latest", response_model=AdvisorChatHistoryResponse)
async def latest_advisor_chat(user=Depends(auth_lib.get_current_user)) -> AdvisorChatHistoryResponse:
    document = await db.advisor_conversations.find_one(
        {"user_id": user["_id"]},
        sort=[("updated_at", -1)],
    )
    if not document:
        return AdvisorChatHistoryResponse(conversation_id=None, messages=[])
    return AdvisorChatHistoryResponse(
        conversation_id=document["_id"],
        messages=_history_messages(document),
    )


@router.post("/chat", response_model=AdvisorChatResponse)
async def advisor_chat(
    input: AdvisorChatRequest,
    user=Depends(auth_lib.get_current_user),
) -> AdvisorChatResponse:
    if not input.messages or input.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="The last chat message must be from the user.")

    now = datetime.now(timezone.utc)
    if input.conversation_id:
        conversation = await db.advisor_conversations.find_one(
            {"_id": input.conversation_id, "user_id": user["_id"]}
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        conversation_id = input.conversation_id
        history = [
            {"role": item["role"], "content": item["content"]}
            for item in conversation.get("messages", [])[-20:]
            if item.get("role") in {"user", "assistant"} and isinstance(item.get("content"), str)
        ]
    else:
        conversation_id = str(uuid4())
        history = []
        try:
            await db.advisor_conversations.insert_one({
                "_id": conversation_id,
                "user_id": user["_id"],
                "messages": [],
                "created_at": now,
                "updated_at": now,
            })
        except Exception as exc:
            logger.exception("Could not create advisor conversation")
            raise HTTPException(status_code=503, detail="Chat history is temporarily unavailable.") from exc

    user_message = input.messages[-1].content
    history_with_current = [*history, {"role": "user", "content": user_message}]
    tools_used: list[str] = []
    provider = "groq"

    api_key = os.environ.get("GROQ_API_KEY")
    if api_key:
        try:
            reply, tools_used = await run_tool_agent(input, history_with_current, _context(input))
        except Exception:
            logger.exception("Groq tool agent failed")
            reply = (
                "The live AI agent is temporarily unavailable. Your scenario is unchanged. "
                "You can still use the Simulation, Insights, and Terraform panels while the agent is unavailable."
            )
            provider = "unavailable"
    else:
        reply = (
            "The live AI agent is not configured because GROQ_API_KEY is missing. "
            "Your scenario is unchanged. You can still use the Simulation, Insights, and Terraform panels."
        )
        provider = "unavailable"

    stored_messages = [
        {"role": "user", "content": user_message, "created_at": now},
        {
            "role": "assistant",
            "content": reply[:4000],
            "tools_used": tools_used,
            "provider": provider,
            "created_at": datetime.now(timezone.utc),
        },
    ]
    try:
        await db.advisor_conversations.update_one(
            {"_id": conversation_id, "user_id": user["_id"]},
            {
                "$push": {"messages": {"$each": stored_messages, "$slice": -40}},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )
    except Exception as exc:
        logger.exception("Could not persist advisor conversation")
        raise HTTPException(status_code=503, detail="Chat history could not be saved. Please retry.") from exc

    return AdvisorChatResponse(
        reply=reply[:4000],
        provider=provider,
        conversation_id=conversation_id,
        tools_used=tools_used,
    )

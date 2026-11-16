import asyncio
import logging
import os
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from lib.db import client, ensure_indexes  # noqa: E402
from models.cloudcost import HealthResponse  # noqa: E402
from routers import auth, recommendations, simulations, terraform, workspaces  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())
    yield
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()


app = FastAPI(title="CloudCost IQ API", version="1.1.0", lifespan=lifespan)
api_router = APIRouter(prefix="/api")


@api_router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, service="cloudcostiq")


api_router.include_router(auth.router)
api_router.include_router(workspaces.router)
api_router.include_router(simulations.router)
api_router.include_router(recommendations.router)
api_router.include_router(terraform.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

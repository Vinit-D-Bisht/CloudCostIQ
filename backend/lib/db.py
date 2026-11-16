"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# Owner-scoped indexes mirror the Postgres (user_id, updated_at DESC) workspace pattern.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "recommendations": [IndexModel([("created_at", DESCENDING)], name="created_at_desc")],
    "users": [
        IndexModel([("email", ASCENDING)], name="email_unique", unique=True),
    ],
    "profiles": [IndexModel([("created_at", DESCENDING)], name="profiles_created_desc")],
    "workspaces": [
        IndexModel([("user_id", ASCENDING), ("updated_at", DESCENDING)], name="user_updated_desc"),
    ],
    "password_resets": [
        IndexModel([("token", ASCENDING)], name="reset_token_unique", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="reset_expires"),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)

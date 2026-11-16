"""JWT cookie auth helpers. Owner-scoped access replaces Postgres RLS on MongoDB."""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, Response, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from lib.db import db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"
COOKIE_NAME = "cloudcostiq_session"
TOKEN_HOURS = 72


def secret_key() -> str:
    return os.environ.get("JWT_SECRET") or os.environ.get("SECRET_KEY") or "cloudcostiq-dev-secret-change-me"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, secret_key(), algorithm=ALGORITHM)


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=os.environ.get("COOKIE_SECURE", "false").lower() == "true",
        max_age=TOKEN_HOURS * 3600,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, secret_key(), algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session") from exc


async def get_current_user(request: Request) -> dict[str, Any]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    user = await db.users.find_one({"_id": user_id}, {"password_hash": 0})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_optional_user(request: Request) -> dict[str, Any] | None:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


CurrentUser = Depends(get_current_user)


async def create_user(email: str, password: str, display_name: str) -> dict[str, Any]:
    existing = await db.users.find_one({"email": email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "_id": user_id,
        "email": email.lower().strip(),
        "password_hash": hash_password(password),
        "display_name": display_name.strip() or email.split("@")[0],
        "created_at": now,
        "provider": "password",
    }
    await db.users.insert_one(doc)
    await db.profiles.insert_one(
        {"_id": user_id, "display_name": doc["display_name"], "created_at": now}
    )
    return {"id": user_id, "email": doc["email"], "display_name": doc["display_name"], "created_at": now.isoformat()}


async def authenticate(email: str, password: str) -> dict[str, Any]:
    user = await db.users.find_one({"email": email.lower().strip()})
    if not user or not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "id": user["_id"],
        "email": user["email"],
        "display_name": user.get("display_name") or user["email"],
        "created_at": user["created_at"].isoformat() if hasattr(user["created_at"], "isoformat") else str(user["created_at"]),
    }


async def create_reset_token(email: str) -> str | None:
    user = await db.users.find_one({"email": email.lower().strip()})
    if not user:
        return None
    token = secrets.token_urlsafe(24)
    await db.password_resets.insert_one(
        {
            "token": token,
            "user_id": user["_id"],
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
            "created_at": datetime.now(timezone.utc),
        }
    )
    return token


async def reset_password(token: str, new_password: str) -> None:
    row = await db.password_resets.find_one({"token": token})
    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    expires = row["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    await db.users.update_one(
        {"_id": row["user_id"]},
        {"$set": {"password_hash": hash_password(new_password)}},
    )
    await db.password_resets.delete_many({"user_id": row["user_id"]})

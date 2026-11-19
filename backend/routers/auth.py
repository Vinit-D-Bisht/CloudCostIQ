import os
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse

from lib import auth as auth_lib
from models.cloudcost import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    ProfileUpdateRequest,
    ResetPasswordRequest,
    SignupRequest,
    UserProfile,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def to_profile(user: dict) -> UserProfile:
    created = user.get("created_at", "")
    if hasattr(created, "isoformat"):
        created = created.isoformat()
    return UserProfile(
        id=user.get("id") or user.get("_id"),
        email=user["email"],
        display_name=user.get("display_name") or user["email"],
        created_at=str(created),
    )


@router.post("/signup", response_model=AuthResponse)
async def signup(body: SignupRequest, response: Response) -> AuthResponse:
    user = await auth_lib.create_user(body.email, body.password, body.display_name)
    token = auth_lib.create_access_token(user["id"], user["email"])
    auth_lib.set_session_cookie(response, token)
    return AuthResponse(user=UserProfile(**user))


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, response: Response) -> AuthResponse:
    user = await auth_lib.authenticate(body.email, body.password)
    token = auth_lib.create_access_token(user["id"], user["email"])
    auth_lib.set_session_cookie(response, token)
    return AuthResponse(user=UserProfile(**user))


@router.post("/logout")
async def logout(response: Response) -> dict:
    auth_lib.clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=AuthResponse)
async def me(user=Depends(auth_lib.get_current_user)) -> AuthResponse:
    return AuthResponse(user=to_profile(user))


@router.patch("/profile", response_model=AuthResponse)
async def update_profile(body: ProfileUpdateRequest, user=Depends(auth_lib.get_current_user)) -> AuthResponse:
    from lib.db import db

    await db.users.update_one({"_id": user["_id"]}, {"$set": {"display_name": body.display_name}})
    await db.profiles.update_one(
        {"_id": user["_id"]},
        {"$set": {"display_name": body.display_name}},
        upsert=True,
    )
    user["display_name"] = body.display_name
    return AuthResponse(user=to_profile(user))


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest) -> dict:
    token = await auth_lib.create_reset_token(body.email)
    # Demo-safe: return token when present so local setups work without SMTP.
    if not token:
        return {"ok": True, "message": "If the account exists, a reset token was issued."}
    return {
        "ok": True,
        "message": "Reset token issued. Use /auth/reset-password.",
        "reset_token": token,
    }


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest) -> dict:
    await auth_lib.reset_password(body.token, body.new_password)
    return {"ok": True}


@router.get("/google/start")
async def google_start() -> RedirectResponse:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8001/api/auth/google/callback")
    if not client_id:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")
    params = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "online",
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(code: str = ""):
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8001/api/auth/google/callback")
    frontend = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    if not client_id or not client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")
    if not code:
        raise HTTPException(status_code=400, detail="Missing OAuth code")

    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0,connect=2.0, read=6.0)) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_res.raise_for_status()
        access = token_res.json().get("access_token")
        profile_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access}"},
        )
        profile_res.raise_for_status()
        profile = profile_res.json()

    email = profile.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    from datetime import datetime, timezone
    from uuid import uuid4

    from lib.db import db

    existing = await db.users.find_one({"email": email.lower()})
    if existing:
        user_id = existing["_id"]
        display_name = existing.get("display_name") or profile.get("name") or email
    else:
        user_id = str(uuid4())
        now = datetime.now(timezone.utc)
        display_name = profile.get("name") or email.split("@")[0]
        await db.users.insert_one(
            {
                "_id": user_id,
                "email": email.lower(),
                "password_hash": "",
                "display_name": display_name,
                "created_at": now,
                "provider": "google",
            }
        )
        await db.profiles.insert_one({"_id": user_id, "display_name": display_name, "created_at": now})

    token = auth_lib.create_access_token(user_id, email.lower())
    redirect = RedirectResponse(f"{frontend}/?auth=1")
    auth_lib.set_session_cookie(redirect, token)
    return redirect

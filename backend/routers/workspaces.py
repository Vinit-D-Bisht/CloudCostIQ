"""Authenticated workspace CRUD. Owner-only access via user_id filter (Mongo equivalent of RLS)."""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from lib import auth as auth_lib
from lib.db import db
from models.cloudcost import WorkspaceDocument, WorkspaceSaveRequest, WorkspaceState, WorkspaceSummary

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _iso(value) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


@router.get("", response_model=list[WorkspaceSummary])
async def list_workspaces(user=Depends(auth_lib.get_current_user)) -> list[WorkspaceSummary]:
    cursor = db.workspaces.find({"user_id": user["_id"]}).sort("updated_at", -1)
    rows = []
    async for doc in cursor:
        rows.append(
            WorkspaceSummary(
                id=doc["_id"],
                name=doc["name"],
                updated_at=_iso(doc["updated_at"]),
                created_at=_iso(doc["created_at"]),
            )
        )
    return rows


@router.get("/{workspace_id}", response_model=WorkspaceDocument)
async def load_workspace(workspace_id: str, user=Depends(auth_lib.get_current_user)) -> WorkspaceDocument:
    doc = await db.workspaces.find_one({"_id": workspace_id, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Workspace not found")
    # Return raw scenario inputs only — client/server recompute costs on restore.
    return WorkspaceDocument(
        id=doc["_id"],
        name=doc["name"],
        state=WorkspaceState.model_validate(doc["state"]),
        created_at=_iso(doc["created_at"]),
        updated_at=_iso(doc["updated_at"]),
    )


@router.post("", response_model=WorkspaceDocument)
async def save_workspace(body: WorkspaceSaveRequest, user=Depends(auth_lib.get_current_user)) -> WorkspaceDocument:
    now = datetime.now(timezone.utc)
    # Persist inputs only (no precomputed cost projections).
    state = body.state.model_dump()
    if body.id:
        existing = await db.workspaces.find_one({"_id": body.id, "user_id": user["_id"]})
        if not existing:
            raise HTTPException(status_code=404, detail="Workspace not found")
        await db.workspaces.update_one(
            {"_id": body.id, "user_id": user["_id"]},
            {"$set": {"name": body.name.strip(), "state": state, "updated_at": now}},
        )
        return WorkspaceDocument(
            id=body.id,
            name=body.name.strip(),
            state=body.state,
            created_at=_iso(existing["created_at"]),
            updated_at=_iso(now),
        )

    workspace_id = str(uuid4())
    doc = {
        "_id": workspace_id,
        "user_id": user["_id"],
        "name": body.name.strip(),
        "state": state,
        "created_at": now,
        "updated_at": now,
    }
    await db.workspaces.insert_one(doc)
    return WorkspaceDocument(
        id=workspace_id,
        name=doc["name"],
        state=body.state,
        created_at=_iso(now),
        updated_at=_iso(now),
    )


@router.delete("/{workspace_id}")
async def delete_workspace(workspace_id: str, user=Depends(auth_lib.get_current_user)) -> dict:
    result = await db.workspaces.delete_one({"_id": workspace_id, "user_id": user["_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"ok": True}

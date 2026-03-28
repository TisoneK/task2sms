from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import List
from datetime import datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.organization import RoleType
from app.services.org_service import (
    create_organization, get_user_orgs, get_org,
    invite_member, update_member_role, remove_member, get_org_members, require_role
)

router = APIRouter(prefix="/orgs", tags=["organizations"])


class OrgCreate(BaseModel):
    name: str


class InviteRequest(BaseModel):
    email: EmailStr
    role: RoleType = RoleType.MEMBER


class RoleUpdate(BaseModel):
    role: RoleType


@router.get("")
async def list_my_orgs(db: AsyncSession = Depends(get_db),
                       current_user=Depends(get_current_user)):
    orgs = await get_user_orgs(db, current_user.id)
    return [{"id": o["org"].id, "name": o["org"].name,
             "slug": o["org"].slug, "role": o["role"],
             "created_at": o["org"].created_at} for o in orgs]


@router.post("", status_code=201)
async def create_org(body: OrgCreate, db: AsyncSession = Depends(get_db),
                     current_user=Depends(get_current_user)):
    org = await create_organization(db, body.name, current_user.id)
    return {"id": org.id, "name": org.name, "slug": org.slug}


@router.get("/{org_id}/members")
async def list_members(org_id: int, db: AsyncSession = Depends(get_db),
                       current_user=Depends(get_current_user)):
    await require_role(db, org_id, current_user.id, RoleType.VIEWER)
    members = await get_org_members(db, org_id)
    return [{
        "user_id": m["user"].id,
        "username": m["user"].username,
        "email": m["user"].email,
        "full_name": m["user"].full_name,
        "role": m["role"],
        "joined_at": m["joined_at"],
    } for m in members]


@router.post("/{org_id}/members", status_code=201)
async def invite(org_id: int, body: InviteRequest,
                 db: AsyncSession = Depends(get_db),
                 current_user=Depends(get_current_user)):
    member = await invite_member(db, org_id, current_user.id, body.email, body.role)
    return {"message": f"User invited with role {member.role}"}


@router.patch("/{org_id}/members/{user_id}")
async def change_role(org_id: int, user_id: int, body: RoleUpdate,
                      db: AsyncSession = Depends(get_db),
                      current_user=Depends(get_current_user)):
    member = await update_member_role(db, org_id, current_user.id, user_id, body.role)
    return {"message": f"Role updated to {member.role}"}


@router.delete("/{org_id}/members/{user_id}", status_code=204)
async def kick_member(org_id: int, user_id: int,
                      db: AsyncSession = Depends(get_db),
                      current_user=Depends(get_current_user)):
    await remove_member(db, org_id, current_user.id, user_id)

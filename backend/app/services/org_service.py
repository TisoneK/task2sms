from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import Optional, List
from fastapi import HTTPException
from app.models.organization import Organization, OrganizationMember, RoleType
from app.models.user import User
import re


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:50]


async def create_organization(db: AsyncSession, name: str, creator_id: int) -> Organization:
    slug = _slugify(name)
    # ensure unique slug
    existing = await db.execute(select(Organization).where(Organization.slug == slug))
    if existing.scalar_one_or_none():
        slug = f"{slug}-{creator_id}"
    org = Organization(name=name, slug=slug, created_by=creator_id)
    db.add(org)
    await db.flush()
    # creator becomes admin
    member = OrganizationMember(org_id=org.id, user_id=creator_id, role=RoleType.ADMIN)
    db.add(member)
    await db.commit()
    await db.refresh(org)
    return org


async def get_user_orgs(db: AsyncSession, user_id: int) -> List[dict]:
    result = await db.execute(
        select(Organization, OrganizationMember.role)
        .join(OrganizationMember, OrganizationMember.org_id == Organization.id)
        .where(OrganizationMember.user_id == user_id)
    )
    return [{"org": o, "role": r} for o, r in result]


async def get_org(db: AsyncSession, org_id: int) -> Optional[Organization]:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    return result.scalar_one_or_none()


async def get_member(db: AsyncSession, org_id: int, user_id: int) -> Optional[OrganizationMember]:
    result = await db.execute(
        select(OrganizationMember).where(
            and_(OrganizationMember.org_id == org_id, OrganizationMember.user_id == user_id)
        )
    )
    return result.scalar_one_or_none()


async def require_role(db: AsyncSession, org_id: int, user_id: int,
                       minimum_role: RoleType = RoleType.MEMBER):
    member = await get_member(db, org_id, user_id)
    if not member:
        raise HTTPException(403, "Not a member of this organization")
    role_order = {RoleType.VIEWER: 0, RoleType.MEMBER: 1, RoleType.ADMIN: 2}
    if role_order[member.role] < role_order[minimum_role]:
        raise HTTPException(403, f"Requires {minimum_role} role or higher")
    return member


async def invite_member(db: AsyncSession, org_id: int, inviter_id: int,
                        email: str, role: RoleType) -> OrganizationMember:
    await require_role(db, org_id, inviter_id, RoleType.ADMIN)
    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, f"No user with email {email}")
    existing = await get_member(db, org_id, user.id)
    if existing:
        raise HTTPException(400, "User is already a member")
    member = OrganizationMember(org_id=org_id, user_id=user.id,
                                 role=role, invited_by=inviter_id)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


async def update_member_role(db: AsyncSession, org_id: int, admin_id: int,
                              target_user_id: int, new_role: RoleType) -> OrganizationMember:
    await require_role(db, org_id, admin_id, RoleType.ADMIN)
    member = await get_member(db, org_id, target_user_id)
    if not member:
        raise HTTPException(404, "Member not found")
    member.role = new_role
    await db.commit()
    await db.refresh(member)
    return member


async def remove_member(db: AsyncSession, org_id: int, admin_id: int, target_user_id: int):
    await require_role(db, org_id, admin_id, RoleType.ADMIN)
    member = await get_member(db, org_id, target_user_id)
    if not member:
        raise HTTPException(404, "Member not found")
    await db.delete(member)
    await db.commit()


async def get_org_members(db: AsyncSession, org_id: int) -> List[dict]:
    result = await db.execute(
        select(User, OrganizationMember.role, OrganizationMember.joined_at)
        .join(OrganizationMember, OrganizationMember.user_id == User.id)
        .where(OrganizationMember.org_id == org_id)
    )
    return [{"user": u, "role": r, "joined_at": j} for u, r, j in result]

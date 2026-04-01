from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.contact import Contact

router = APIRouter(prefix="/contacts", tags=["contacts"])

VALID_TYPES = {"email", "phone", "telegram", "whatsapp"}


class ContactCreate(BaseModel):
    label: Optional[str] = None
    type: str
    value: str


class ContactUpdate(BaseModel):
    label: Optional[str] = None
    type: Optional[str] = None
    value: Optional[str] = None


def _out(c: Contact) -> dict:
    return {
        "id": c.id,
        "label": c.label,
        "type": c.type,
        "value": c.value,
        "use_count": c.use_count,
        "created_at": c.created_at,
    }


@router.get("")
async def list_contacts(db: AsyncSession = Depends(get_db),
                        current_user=Depends(get_current_user)):
    result = await db.execute(
        select(Contact)
        .where(Contact.user_id == current_user.id)
        .order_by(Contact.use_count.desc(), Contact.created_at.desc())
    )
    return [_out(c) for c in result.scalars().all()]


@router.post("", status_code=201)
async def create_contact(body: ContactCreate,
                         db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    if body.type not in VALID_TYPES:
        raise HTTPException(400, f"type must be one of {sorted(VALID_TYPES)}")
    # Upsert: if value already exists for this user, just return it
    result = await db.execute(
        select(Contact).where(Contact.user_id == current_user.id,
                              Contact.value == body.value.strip())
    )
    existing = result.scalar_one_or_none()
    if existing:
        if body.label:
            existing.label = body.label
        await db.commit()
        return _out(existing)
    c = Contact(user_id=current_user.id, label=body.label,
                type=body.type, value=body.value.strip())
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return _out(c)


@router.patch("/{cid}")
async def update_contact(cid: int, body: ContactUpdate,
                         db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    result = await db.execute(
        select(Contact).where(Contact.id == cid, Contact.user_id == current_user.id)
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Contact not found")
    if body.label is not None:
        c.label = body.label
    if body.type is not None:
        if body.type not in VALID_TYPES:
            raise HTTPException(400, f"type must be one of {sorted(VALID_TYPES)}")
        c.type = body.type
    if body.value is not None:
        c.value = body.value.strip()
    await db.commit()
    return _out(c)


@router.delete("/{cid}", status_code=204)
async def delete_contact(cid: int,
                         db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    result = await db.execute(
        select(Contact).where(Contact.id == cid, Contact.user_id == current_user.id)
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Contact not found")
    await db.delete(c)
    await db.commit()


async def bump_use_count(db: AsyncSession, user_id: int, values: list[str]):
    """Increment use_count for all matching contacts, create new ones if not found."""
    for val in values:
        val = val.strip()
        if not val:
            continue
        result = await db.execute(
            select(Contact).where(Contact.user_id == user_id, Contact.value == val)
        )
        c = result.scalar_one_or_none()
        if c:
            c.use_count = (c.use_count or 0) + 1
        else:
            # Auto-create from recipient string — infer type
            t = "email" if "@" in val else "telegram" if val.lstrip("-").isdigit() and len(val) > 6 else "phone"
            db.add(Contact(user_id=user_id, type=t, value=val, use_count=1))
    await db.commit()

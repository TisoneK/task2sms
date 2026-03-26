from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, Any
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.datasource import DataSource, DataSourceType
from app.services.datasource_service import (
    get_datasources, get_datasource, fetch_datasource
)

router = APIRouter(prefix="/datasources", tags=["datasources"])


class DataSourceCreate(BaseModel):
    name: str
    type: DataSourceType
    url: Optional[str] = None
    http_method: str = "GET"
    http_headers: Optional[dict] = None
    http_body: Optional[str] = None
    json_path: Optional[str] = None
    connection_string: Optional[str] = None
    query: Optional[str] = None
    auth_type: Optional[str] = None
    auth_value: Optional[str] = None


class DataSourceUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    http_method: Optional[str] = None
    http_headers: Optional[dict] = None
    http_body: Optional[str] = None
    json_path: Optional[str] = None
    auth_type: Optional[str] = None
    auth_value: Optional[str] = None
    is_active: Optional[bool] = None


def _out(ds: DataSource) -> dict:
    return {
        "id": ds.id, "name": ds.name, "type": ds.type,
        "url": ds.url, "http_method": ds.http_method,
        "json_path": ds.json_path, "auth_type": ds.auth_type,
        "is_active": ds.is_active,
        "last_fetched_at": ds.last_fetched_at,
        "last_result": ds.last_result,
        "created_at": ds.created_at,
    }


@router.get("")
async def list_datasources(db: AsyncSession = Depends(get_db),
                            current_user=Depends(get_current_user)):
    return [_out(ds) for ds in await get_datasources(db, current_user.id)]


@router.post("", status_code=201)
async def create_datasource(body: DataSourceCreate,
                             db: AsyncSession = Depends(get_db),
                             current_user=Depends(get_current_user)):
    ds = DataSource(user_id=current_user.id, **body.model_dump())
    db.add(ds)
    await db.commit()
    await db.refresh(ds)
    return _out(ds)


@router.get("/{ds_id}")
async def get_one(ds_id: int, db: AsyncSession = Depends(get_db),
                  current_user=Depends(get_current_user)):
    ds = await get_datasource(db, ds_id, current_user.id)
    if not ds:
        raise HTTPException(404, "Data source not found")
    return _out(ds)


@router.patch("/{ds_id}")
async def update_datasource(ds_id: int, body: DataSourceUpdate,
                             db: AsyncSession = Depends(get_db),
                             current_user=Depends(get_current_user)):
    ds = await get_datasource(db, ds_id, current_user.id)
    if not ds:
        raise HTTPException(404, "Data source not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(ds, k, v)
    await db.commit()
    await db.refresh(ds)
    return _out(ds)


@router.delete("/{ds_id}", status_code=204)
async def delete_datasource(ds_id: int, db: AsyncSession = Depends(get_db),
                             current_user=Depends(get_current_user)):
    ds = await get_datasource(db, ds_id, current_user.id)
    if not ds:
        raise HTTPException(404, "Data source not found")
    await db.delete(ds)
    await db.commit()


@router.post("/{ds_id}/fetch")
async def fetch_now(ds_id: int, db: AsyncSession = Depends(get_db),
                    current_user=Depends(get_current_user)):
    ds = await get_datasource(db, ds_id, current_user.id)
    if not ds:
        raise HTTPException(404, "Data source not found")
    try:
        result = await fetch_datasource(db, ds)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(400, f"Fetch failed: {str(e)}")

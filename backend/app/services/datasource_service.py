import httpx, json, csv, io
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from datetime import datetime, timezone
from app.models.datasource import DataSource, DataSourceType
import logging

logger = logging.getLogger(__name__)


async def fetch_http(ds: DataSource) -> Any:
    headers = ds.http_headers or {}
    if ds.auth_type == "bearer":
        headers["Authorization"] = f"Bearer {ds.auth_value}"
    elif ds.auth_type == "apikey":
        headers["X-API-Key"] = ds.auth_value

    async with httpx.AsyncClient(timeout=15) as client:
        method = (ds.http_method or "GET").upper()
        resp = await client.request(method, ds.url, headers=headers,
                                    content=ds.http_body)
        resp.raise_for_status()
        data = resp.json()

    if ds.json_path:
        for key in ds.json_path.split("."):
            if isinstance(data, list):
                try:
                    data = data[int(key)]
                except (ValueError, IndexError):
                    break
            elif isinstance(data, dict):
                data = data.get(key, {})
    return data


async def fetch_csv_url(ds: DataSource) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(ds.url)
        resp.raise_for_status()
    reader = csv.DictReader(io.StringIO(resp.text))
    return list(reader)


async def fetch_datasource(db: AsyncSession, ds: DataSource) -> Any:
    """Fetch data from source, cache result, return data."""
    try:
        if ds.type == DataSourceType.HTTP:
            result = await fetch_http(ds)
        elif ds.type == DataSourceType.CSV_URL:
            result = await fetch_csv_url(ds)
        else:
            result = {"error": f"DB sources require server-side config. type={ds.type}"}

        ds.last_result = result if isinstance(result, (dict, list)) else {"value": result}
        ds.last_fetched_at = datetime.now(timezone.utc)
        await db.commit()
        return result
    except Exception as e:
        logger.error(f"DataSource {ds.id} fetch error: {e}")
        raise


async def get_datasources(db: AsyncSession, user_id: int) -> list[DataSource]:
    result = await db.execute(
        select(DataSource).where(DataSource.user_id == user_id).order_by(DataSource.created_at.desc())
    )
    return result.scalars().all()


async def get_datasource(db: AsyncSession, ds_id: int, user_id: int) -> Optional[DataSource]:
    result = await db.execute(
        select(DataSource).where(DataSource.id == ds_id, DataSource.user_id == user_id)
    )
    return result.scalar_one_or_none()

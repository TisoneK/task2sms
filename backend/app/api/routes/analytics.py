from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.services.analytics_service import get_full_analytics, export_notifications_xlsx

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("")
async def analytics(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await get_full_analytics(db, current_user.id, days)


@router.get("/export/notifications.xlsx")
async def export_xlsx(db: AsyncSession = Depends(get_db),
                      current_user=Depends(get_current_user)):
    data = await export_notifications_xlsx(db, current_user.id)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=notifications.xlsx"},
    )

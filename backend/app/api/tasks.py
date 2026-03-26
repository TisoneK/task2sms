from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.schemas import TaskCreate, TaskUpdate, TaskOut, PaginatedResponse
from app.services.task_service import (
    get_tasks, get_task, create_task, update_task,
    delete_task, execute_task
)
from app.workers.scheduler import schedule_task, unschedule_task
from app.models.task import TaskStatus
import math

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=PaginatedResponse)
async def list_tasks(
    page: int = 1, per_page: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    skip = (page - 1) * per_page
    tasks, total = await get_tasks(db, current_user.id, skip, per_page)
    return PaginatedResponse(
        items=[TaskOut.model_validate(t) for t in tasks],
        total=total, page=page, per_page=per_page,
        pages=math.ceil(total / per_page) if total else 0
    )


@router.post("", response_model=TaskOut, status_code=201)
async def create_new_task(
    task_data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await create_task(db, task_data, current_user.id)
    schedule_task(task)
    return task


@router.get("/{task_id}", response_model=TaskOut)
async def get_single_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await get_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.patch("/{task_id}", response_model=TaskOut)
async def update_existing_task(
    task_id: int,
    update_data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await get_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(404, "Task not found")
    task = await update_task(db, task, update_data)
    schedule_task(task)  # re-schedule with new config
    return task


@router.delete("/{task_id}", status_code=204)
async def delete_existing_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await get_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(404, "Task not found")
    unschedule_task(task.id)
    await delete_task(db, task)


@router.post("/{task_id}/run", response_model=dict)
async def run_task_now(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await get_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(404, "Task not found")
    notifications = await execute_task(db, task)
    sent = sum(1 for n in notifications if n.status.value == "sent") if notifications else 0
    return {"message": f"Task executed. {sent}/{len(notifications or [])} SMS sent."}


@router.patch("/{task_id}/toggle", response_model=TaskOut)
async def toggle_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = await get_task(db, task_id, current_user.id)
    if not task:
        raise HTTPException(404, "Task not found")
    new_status = TaskStatus.PAUSED if task.status == TaskStatus.ACTIVE else TaskStatus.ACTIVE
    task = await update_task(db, task, TaskUpdate(status=new_status))
    if new_status == TaskStatus.ACTIVE:
        schedule_task(task)
    else:
        unschedule_task(task.id)
    return task

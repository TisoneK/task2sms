"""Proxy — re-exports from core subpackage."""
from app.services.core.task_service import *  # noqa
from app.services.core.task_service import (
    get_tasks, get_task, create_task, update_task,
    delete_task, execute_task, evaluate_condition,
)

"""Tests for the Task <- Data Source context wiring (task_service).

build_task_context fetches a task's linked data source into the dict that
evaluate_condition and the message template read from. A failed or non-object
fetch must degrade to {} (never crash a scheduled run), and a task with no data
source returns None (unchanged legacy behaviour).
"""

from types import SimpleNamespace

import app.services.integrations.datasource_service as ds_mod
from app.models.task import Task
from app.services.core.task_service import build_task_context, evaluate_condition


def _task(**kw):
    kw.setdefault("data_source_id", None)
    return SimpleNamespace(id=1, user_id=7, **kw)


async def test_no_data_source_returns_none():
    assert await build_task_context(None, _task()) is None


async def test_missing_data_source_returns_empty(monkeypatch):
    async def fake_get(db, ds_id, user_id):
        return None
    monkeypatch.setattr(ds_mod, "get_datasource", fake_get)
    assert await build_task_context(None, _task(data_source_id=99)) == {}


async def test_fetch_returns_object(monkeypatch):
    async def fake_get(db, ds_id, user_id):
        return SimpleNamespace(id=ds_id)

    async def fake_fetch(db, ds):
        return {"q1_total": 23, "status": "live", "quarter": 1}

    monkeypatch.setattr(ds_mod, "get_datasource", fake_get)
    monkeypatch.setattr(ds_mod, "fetch_datasource", fake_fetch)
    ctx = await build_task_context(None, _task(data_source_id=5))
    assert ctx == {"q1_total": 23, "status": "live", "quarter": 1}


async def test_fetch_non_object_degrades_to_empty(monkeypatch):
    async def fake_get(db, ds_id, user_id):
        return SimpleNamespace(id=ds_id)

    async def fake_fetch(db, ds):
        return [1, 2, 3]  # a list has no named fields to key off

    monkeypatch.setattr(ds_mod, "get_datasource", fake_get)
    monkeypatch.setattr(ds_mod, "fetch_datasource", fake_fetch)
    assert await build_task_context(None, _task(data_source_id=5)) == {}


async def test_fetch_error_degrades_to_empty(monkeypatch):
    async def fake_get(db, ds_id, user_id):
        return SimpleNamespace(id=ds_id)

    async def fake_fetch(db, ds):
        raise RuntimeError("endpoint down")

    monkeypatch.setattr(ds_mod, "get_datasource", fake_get)
    monkeypatch.setattr(ds_mod, "fetch_datasource", fake_fetch)
    assert await build_task_context(None, _task(data_source_id=5)) == {}


# --- condition evaluation against a data-source context (sync, no DB) ------- #

def _cond_task(field, op, value):
    t = Task(name="x", message_template="m", recipients=["+100"])
    t.condition_enabled = True
    t.condition_field = field
    t.condition_operator = op
    t.condition_value = value
    return t


def test_condition_numeric_threshold_met():
    t = _cond_task("q1_total", "gte", "22")
    assert evaluate_condition(t, {"q1_total": 23}) is True
    assert evaluate_condition(t, {"q1_total": 21}) is False


def test_condition_string_equals():
    t = _cond_task("status", "eq", "live")
    assert evaluate_condition(t, {"status": "live"}) is True
    assert evaluate_condition(t, {"status": "scheduled"}) is False


def test_condition_quarter_past_q1():
    t = _cond_task("quarter", "gte", "2")
    assert evaluate_condition(t, {"quarter": 2}) is True
    assert evaluate_condition(t, {"quarter": 1}) is False

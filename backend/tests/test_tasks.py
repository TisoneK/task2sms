import pytest

pytestmark = pytest.mark.asyncio

TASK_PAYLOAD = {
    "name": "Test Task",
    "schedule_type": "interval",
    "interval_value": 1,
    "interval_unit": "hours",
    "recipients": ["+254712345678"],
    "message_template": "Hello from test",
}


async def test_create_task(auth_client):
    resp = await auth_client.post("/api/tasks", json=TASK_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Task"
    assert data["status"] == "active"


async def test_list_tasks(auth_client):
    await auth_client.post("/api/tasks", json=TASK_PAYLOAD)
    await auth_client.post("/api/tasks", json={**TASK_PAYLOAD, "name": "Task 2"})
    resp = await auth_client.get("/api/tasks")
    assert resp.status_code == 200
    assert resp.json()["total"] == 2


async def test_get_task(auth_client):
    create = await auth_client.post("/api/tasks", json=TASK_PAYLOAD)
    tid = create.json()["id"]
    resp = await auth_client.get(f"/api/tasks/{tid}")
    assert resp.status_code == 200
    assert resp.json()["id"] == tid


async def test_update_task(auth_client):
    create = await auth_client.post("/api/tasks", json=TASK_PAYLOAD)
    tid = create.json()["id"]
    resp = await auth_client.patch(f"/api/tasks/{tid}", json={"name": "Updated Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


async def test_toggle_task(auth_client):
    create = await auth_client.post("/api/tasks", json=TASK_PAYLOAD)
    tid = create.json()["id"]
    resp = await auth_client.patch(f"/api/tasks/{tid}/toggle")
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"
    resp2 = await auth_client.patch(f"/api/tasks/{tid}/toggle")
    assert resp2.json()["status"] == "active"


async def test_delete_task(auth_client):
    create = await auth_client.post("/api/tasks", json=TASK_PAYLOAD)
    tid = create.json()["id"]
    resp = await auth_client.delete(f"/api/tasks/{tid}")
    assert resp.status_code == 204
    get_resp = await auth_client.get(f"/api/tasks/{tid}")
    assert get_resp.status_code == 404


async def test_run_task(auth_client):
    create = await auth_client.post("/api/tasks", json=TASK_PAYLOAD)
    tid = create.json()["id"]
    resp = await auth_client.post(f"/api/tasks/{tid}/run")
    assert resp.status_code == 200
    assert "message" in resp.json()


async def test_conditional_task_create(auth_client):
    payload = {
        **TASK_PAYLOAD,
        "condition_enabled": True,
        "condition_field": "score",
        "condition_operator": "lt",
        "condition_value": "50",
    }
    resp = await auth_client.post("/api/tasks", json=payload)
    assert resp.status_code == 201
    assert resp.json()["condition_enabled"] is True


async def test_cron_task(auth_client):
    resp = await auth_client.post("/api/tasks", json={
        **TASK_PAYLOAD,
        "schedule_type": "cron",
        "cron_expression": "0 9 * * 1-5",
    })
    assert resp.status_code == 201
    assert resp.json()["cron_expression"] == "0 9 * * 1-5"

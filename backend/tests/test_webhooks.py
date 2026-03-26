import pytest

pytestmark = pytest.mark.asyncio

WEBHOOK_PAYLOAD = {
    "name": "Test Webhook",
    "url": "https://example.com/hook",
    "events": ["sms.sent", "task.run"],
    "is_active": True,
}


async def test_create_webhook(auth_client):
    resp = await auth_client.post("/api/webhooks", json=WEBHOOK_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Webhook"
    assert "sms.sent" in data["events"]


async def test_list_webhooks(auth_client):
    await auth_client.post("/api/webhooks", json=WEBHOOK_PAYLOAD)
    resp = await auth_client.get("/api/webhooks")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_update_webhook(auth_client):
    create = await auth_client.post("/api/webhooks", json=WEBHOOK_PAYLOAD)
    wid = create.json()["id"]
    resp = await auth_client.patch(f"/api/webhooks/{wid}", json={"is_active": False})
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


async def test_delete_webhook(auth_client):
    create = await auth_client.post("/api/webhooks", json=WEBHOOK_PAYLOAD)
    wid = create.json()["id"]
    resp = await auth_client.delete(f"/api/webhooks/{wid}")
    assert resp.status_code == 204
    list_resp = await auth_client.get("/api/webhooks")
    assert len(list_resp.json()) == 0


async def test_invalid_event(auth_client):
    resp = await auth_client.post("/api/webhooks", json={
        **WEBHOOK_PAYLOAD,
        "events": ["not.a.real.event"],
    })
    assert resp.status_code == 400


async def test_event_types_list(auth_client):
    resp = await auth_client.get("/api/webhooks/events/list")
    assert resp.status_code == 200
    assert "sms.sent" in resp.json()["events"]

import pytest

pytestmark = pytest.mark.asyncio


async def test_stats_empty(auth_client):
    resp = await auth_client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "tasks" in data
    assert "notifications" in data
    assert data["tasks"]["total"] == 0
    assert data["notifications"]["sent"] == 0


async def test_stats_after_send(auth_client):
    await auth_client.post("/api/sms/send", json={
        "recipients": ["+254712345678"], "message": "Stats test"
    })
    resp = await auth_client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["notifications"]["total"] >= 1


async def test_analytics_empty(auth_client):
    resp = await auth_client.get("/api/analytics")
    assert resp.status_code == 200
    data = resp.json()
    assert "sms" in data
    assert "email" in data
    assert "whatsapp" in data
    assert "daily_sms" in data
    assert "top_tasks" in data


async def test_analytics_period_param(auth_client):
    resp7 = await auth_client.get("/api/analytics?days=7")
    resp90 = await auth_client.get("/api/analytics?days=90")
    assert resp7.status_code == 200
    assert resp90.status_code == 200
    assert resp7.json()["period_days"] == 7
    assert resp90.json()["period_days"] == 90


async def test_analytics_export(auth_client):
    resp = await auth_client.get("/api/analytics/export/notifications.xlsx")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert len(resp.content) > 0

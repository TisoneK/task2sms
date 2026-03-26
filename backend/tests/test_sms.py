import pytest
from app.services.sms_service import MockProvider, SMSResult

pytestmark = pytest.mark.asyncio


async def test_mock_provider_send():
    provider = MockProvider()
    result = await provider.send("+254712345678", "Hello test")
    assert isinstance(result, SMSResult)
    assert result.success is True
    assert result.message_id is not None


async def test_mock_provider_name():
    assert MockProvider().name == "mock"


async def test_send_sms_endpoint(auth_client):
    resp = await auth_client.post("/api/sms/send", json={
        "recipients": ["+254712345678"],
        "message": "Test SMS",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "sent" in data
    assert "failed" in data
    assert "results" in data


async def test_send_sms_multiple_recipients(auth_client):
    resp = await auth_client.post("/api/sms/send", json={
        "recipients": ["+254700000001", "+254700000002", "+254700000003"],
        "message": "Bulk SMS test",
    })
    assert resp.status_code == 200
    assert len(resp.json()["results"]) == 3


async def test_notification_history(auth_client):
    await auth_client.post("/api/sms/send", json={
        "recipients": ["+254712345678"],
        "message": "History test",
    })
    resp = await auth_client.get("/api/notifications")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1

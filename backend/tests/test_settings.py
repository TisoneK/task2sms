import pytest

pytestmark = pytest.mark.asyncio


async def test_update_profile(auth_client):
    resp = await auth_client.patch("/api/settings/profile", json={"full_name": "Updated Name"})
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Updated Name"


async def test_update_email(auth_client):
    resp = await auth_client.patch("/api/settings/profile", json={"email": "new@example.com"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "new@example.com"


async def test_change_password_success(auth_client):
    resp = await auth_client.post("/api/settings/change-password", json={
        "current_password": "testpass123",
        "new_password": "newpassword456",
    })
    assert resp.status_code == 200
    assert "updated" in resp.json()["message"].lower()


async def test_change_password_wrong_current(auth_client):
    resp = await auth_client.post("/api/settings/change-password", json={
        "current_password": "wrongpassword",
        "new_password": "newpassword456",
    })
    assert resp.status_code == 400


async def test_change_password_too_short(auth_client):
    resp = await auth_client.post("/api/settings/change-password", json={
        "current_password": "testpass123",
        "new_password": "short",
    })
    assert resp.status_code == 400

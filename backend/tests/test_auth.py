import pytest

pytestmark = pytest.mark.asyncio


async def test_register(client):
    resp = await client.post("/api/auth/register", json={
        "email": "user@example.com",
        "username": "newuser",
        "password": "password123",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["username"] == "newuser"


async def test_register_duplicate_email(client):
    payload = {"email": "dup@example.com", "username": "u1", "password": "pass1234"}
    await client.post("/api/auth/register", json=payload)
    payload["username"] = "u2"
    resp = await client.post("/api/auth/register", json=payload)
    assert resp.status_code == 400


async def test_login_success(client):
    await client.post("/api/auth/register", json={
        "email": "login@example.com", "username": "loginuser", "password": "mypassword"
    })
    resp = await client.post("/api/auth/login", json={
        "username": "loginuser", "password": "mypassword"
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


async def test_login_wrong_password(client):
    await client.post("/api/auth/register", json={
        "email": "wp@example.com", "username": "wpuser", "password": "correct"
    })
    resp = await client.post("/api/auth/login", json={
        "username": "wpuser", "password": "wrong"
    })
    assert resp.status_code == 401


async def test_me(auth_client):
    resp = await auth_client.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json()["username"] == "testuser"


async def test_me_no_token(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401

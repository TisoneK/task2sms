import pytest

pytestmark = pytest.mark.asyncio


async def _register(client, username, email):
    await client.post("/api/auth/register", json={
        "email": email, "username": username, "password": "pass1234"
    })


async def test_create_org(auth_client):
    resp = await auth_client.post("/api/orgs", json={"name": "Test Org"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Org"
    assert "slug" in data


async def test_list_orgs(auth_client):
    await auth_client.post("/api/orgs", json={"name": "Org A"})
    await auth_client.post("/api/orgs", json={"name": "Org B"})
    resp = await auth_client.get("/api/orgs")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_org_creator_is_admin(auth_client):
    create = await auth_client.post("/api/orgs", json={"name": "Admin Org"})
    oid = create.json()["id"]
    members = await auth_client.get(f"/api/orgs/{oid}/members")
    assert members.status_code == 200
    me = members.json()[0]
    assert me["role"] == "admin"


async def test_invite_nonexistent_user(auth_client):
    create = await auth_client.post("/api/orgs", json={"name": "My Org"})
    oid = create.json()["id"]
    resp = await auth_client.post(f"/api/orgs/{oid}/members", json={
        "email": "ghost@nowhere.com", "role": "member"
    })
    assert resp.status_code == 404


async def test_viewer_cannot_invite(client):
    # Register two users
    await client.post("/api/auth/register", json={
        "email": "owner@x.com", "username": "owner", "password": "pass1234"
    })
    login = await client.post("/api/auth/login", json={"username": "owner", "password": "pass1234"})
    owner_token = login.json()["access_token"]

    await client.post("/api/auth/register", json={
        "email": "viewer@x.com", "username": "viewer_user", "password": "pass1234"
    })
    vlogin = await client.post("/api/auth/login", json={"username": "viewer_user", "password": "pass1234"})
    viewer_token = vlogin.json()["access_token"]

    # Owner creates org and invites viewer
    client.headers["Authorization"] = f"Bearer {owner_token}"
    org = await client.post("/api/orgs", json={"name": "Perm Test"})
    oid = org.json()["id"]
    await client.post(f"/api/orgs/{oid}/members", json={"email": "viewer@x.com", "role": "viewer"})

    # Viewer tries to invite someone else — should 403
    client.headers["Authorization"] = f"Bearer {viewer_token}"
    resp = await client.post(f"/api/orgs/{oid}/members", json={"email": "other@x.com", "role": "member"})
    assert resp.status_code == 403

import pytest

pytestmark = pytest.mark.asyncio

DS_PAYLOAD = {
    "name": "Test API",
    "type": "http",
    "url": "https://jsonplaceholder.typicode.com/todos/1",
    "http_method": "GET",
    "auth_type": "none",
}


async def test_create_datasource(auth_client):
    resp = await auth_client.post("/api/datasources", json=DS_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test API"
    assert data["type"] == "http"


async def test_list_datasources(auth_client):
    await auth_client.post("/api/datasources", json=DS_PAYLOAD)
    resp = await auth_client.get("/api/datasources")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_update_datasource(auth_client):
    create = await auth_client.post("/api/datasources", json=DS_PAYLOAD)
    did = create.json()["id"]
    resp = await auth_client.patch(f"/api/datasources/{did}", json={"name": "Updated"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"


async def test_delete_datasource(auth_client):
    create = await auth_client.post("/api/datasources", json=DS_PAYLOAD)
    did = create.json()["id"]
    del_resp = await auth_client.delete(f"/api/datasources/{did}")
    assert del_resp.status_code == 204
    list_resp = await auth_client.get("/api/datasources")
    assert len(list_resp.json()) == 0


async def test_get_datasource_not_found(auth_client):
    resp = await auth_client.get("/api/datasources/99999")
    assert resp.status_code == 404

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_auth_me_requires_auth():
    # No auth -> 401
    r = client.get("/api/auth/me")
    assert r.status_code == 401
    assert r.json().get("detail") in ("Not authenticated", "Invalid token")


def test_login_and_me_flow():
    # Use seeded admin credentials (seeded by startup)
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login.status_code == 200
    data = login.json()
    assert "access_token" in data
    token = data["access_token"]

    # Use token to call /api/auth/me
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    body = me.json()
    assert body.get("username") == "admin"
    assert "roles" in body

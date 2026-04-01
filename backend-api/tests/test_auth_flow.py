import requests
import pytest

BASE = "http://127.0.0.1:8000"


def ensure_server_up():
    try:
        r = requests.get(f"{BASE}/health", timeout=2)
        return r.status_code == 200
    except Exception:
        return False


def test_auth_me_requires_auth():
    if not ensure_server_up():
        pytest.skip("Backend not running on http://127.0.0.1:8000")
    r = requests.get(f"{BASE}/api/auth/me")
    assert r.status_code == 401
    assert r.json().get("detail") in ("Not authenticated", "Invalid token")


def test_login_and_me_flow():
    if not ensure_server_up():
        pytest.skip("Backend not running on http://127.0.0.1:8000")
    login = requests.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login.status_code == 200
    data = login.json()
    assert "access_token" in data
    token = data["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    me = requests.get(f"{BASE}/api/auth/me", headers=headers)
    assert me.status_code == 200
    body = me.json()
    assert body.get("username") == "admin"
    assert "roles" in body

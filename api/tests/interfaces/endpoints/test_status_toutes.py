from fastapi.testclient import TestClient


def test_get_status(client: TestClient) -> None:
    """测试获取应用状态API接口"""
    response = client.get("/api/status")
    data = response.json()

    assert response.status_code == 200
    assert data.get("code") == 200

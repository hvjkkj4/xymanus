import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    """
    创建一个可供所有测试用例使用的 TestClient 客户端。
    scope="session" 表示该 fixture 在整个测试会话只会被实例化一次，提高执行效率
    :return: TestClient
    """
    with TestClient(app) as c:
        yield c

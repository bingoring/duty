from fastapi.testclient import TestClient

from solver.app import app

from .factory import request

client = TestClient(app)


def test_health():
    assert client.get("/health").json()["ok"] is True


def test_solve_계약대로_응답한다():
    res = client.post("/solve", json=request(time_limit=2))
    assert res.status_code == 200
    body = res.json()
    assert body["status"] in ("OPTIMAL", "FEASIBLE")
    assert set(body["objective"]["terms"]) >= {"offShortMax", "requestMiss", "tieBreak"}
    assert all("offKind" in c for c in body["cells"] if c["code"] == "OFF")


def test_잘못된_입력은_422():
    bad = request()
    bad["contractVersion"] = 2
    assert client.post("/solve", json=bad).status_code == 422

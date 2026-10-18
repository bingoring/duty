"""의사 솔버 (3-7d). 솔버가 보장하는 성질만 본다: 하드 제약, 작은 경우의 최적, 결정성, 불가능 원인."""

from __future__ import annotations

import time
from collections import Counter
from datetime import date, timedelta

from fastapi.testclient import TestClient

from solver.app import app
from solver.doctor import solve_doctor

client = TestClient(app)
IDS = ("A", "B", "C", "K", "E")


def month(y: int, m: int) -> list[str]:
    d, out = date(y, m, 1), []
    while d.month == m:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def doctor(i: str, d: int = 6, n: int = 6, **kw) -> dict:
    return {
        "id": i,
        "dCount": d,
        "nCount": n,
        "allDayMin": None,
        "allDayMax": None,
        "fixed": [],
        "requests": [],
    } | kw


def request(days: list[str] | None = None, doctors: list[dict] | None = None, seed: int = 1) -> dict:
    """기본: 2026-10(31일) 5명, A는 D 7·B는 N 7, 나머지 6/6."""
    days = days or month(2026, 10)
    if doctors is None:
        doctors = [doctor(i) for i in IDS]
        doctors[0]["dCount"] = 7
        doctors[1]["nCount"] = 7
    return {
        "contractVersion": 1,
        "seed": seed,
        "timeLimitSec": 5,
        "days": days,
        "doctors": doctors,
        "prevLastNight": None,
    }


def weekday_days(days: list[str], wd: int) -> list[str]:
    return [d for d in days if date.fromisoformat(d).weekday() == wd]


def by_date(out: dict) -> dict[str, dict]:
    return {s["date"]: s for s in out["shifts"]}


def check_hard(req: dict, out: dict) -> None:
    assert out["status"] in ("OPTIMAL", "FEASIBLE")
    assert [s["date"] for s in out["shifts"]] == req["days"]
    dc = Counter(s["day"] for s in out["shifts"])
    nc = Counter(s["night"] for s in out["shifts"])
    for doc in req["doctors"]:
        assert dc[doc["id"]] == doc["dCount"]
        assert nc[doc["id"]] == doc["nCount"]


def test_매일_D_N_한명씩_개수_정확():
    for days, doctors in ((month(2026, 10), None), (month(2026, 11), [doctor(i) for i in IDS])):
        req = request(days, doctors)
        out = solve_doctor(req)
        check_hard(req, out)
        assert set(out["objective"]["terms"]) == {
            "requestMiss",
            "requestMissMax",
            "allDayOut",
            "nightToDay",
            "tieBreak",
        }


def test_고정_조건_지킨다():
    req = request()
    days = req["days"]
    sundays, saturdays = weekday_days(days, 6), weekday_days(days, 5)
    req["doctors"][0]["fixed"] = [{"date": d, "shift": "ANY", "type": "forbid"} for d in sundays]
    req["doctors"][1]["fixed"] = [{"date": d, "shift": "N", "type": "require"} for d in saturdays]
    req["doctors"][2]["fixed"] = [
        {"date": days[0], "shift": "D", "type": "require"},
        {"date": days[1], "shift": "N", "type": "forbid"},
        {"date": days[2], "shift": "ANY", "type": "require"},
    ]
    out = solve_doctor(req)
    check_hard(req, out)
    s = by_date(out)
    assert all("A" not in (s[d]["day"], s[d]["night"]) for d in sundays)
    assert all(s[d]["night"] == "B" for d in saturdays)
    assert s[days[0]]["day"] == "C"
    assert s[days[1]]["night"] != "C"
    assert "C" in (s[days[2]]["day"], s[days[2]]["night"])


def test_신청_하나는_최적이면_지킨다():
    for opt, date_i in (("O", 9), ("ALLDAY", 20)):
        req = request()
        d = req["days"][date_i]
        req["doctors"][3]["requests"] = [{"date": d, "options": [opt]}]
        out = solve_doctor(req)
        check_hard(req, out)
        assert out["status"] == "OPTIMAL"
        assert out["objective"]["terms"]["requestMiss"] == 0
        s = by_date(out)[d]
        if opt == "O":
            assert "K" not in (s["day"], s["night"])
        else:
            assert s["day"] == s["night"] == "K"


def test_올데이_0개_범위():
    req = request()
    req["doctors"][2] |= {"allDayMin": 0, "allDayMax": 0}
    out = solve_doctor(req)
    check_hard(req, out)
    assert out["status"] == "OPTIMAL"
    assert out["objective"]["terms"]["allDayOut"] == 0
    assert not any(s["day"] == s["night"] == "C" for s in out["shifts"])


def test_같은_시드는_같은_안():
    a, b = solve_doctor(request(seed=7)), solve_doctor(request(seed=7))
    assert a["shifts"] == b["shifts"]
    assert a["objective"] == b["objective"]


def test_개수_합이_안맞으면_COUNT():
    req = request()
    req["doctors"][0]["dCount"] = 8
    out = solve_doctor(req)
    assert out["status"] == "INFEASIBLE"
    assert out["causes"] == [{"kind": "COUNT"}]


def test_고정끼리_충돌하면_FIXED():
    req = request()
    d = req["days"][5]
    for doc in req["doctors"][:2]:
        doc["fixed"] = [{"date": d, "shift": "D", "type": "require"}]
    out = solve_doctor(req)
    assert out["status"] == "INFEASIBLE"
    causes = out["causes"]
    assert causes and all(c["kind"] == "FIXED" and c["date"] == d for c in causes)
    assert {c["userId"] for c in causes} == {"A", "B"}


def test_HTTP_계약대로_응답한다():
    res = client.post("/solve/doctor", json=request())
    assert res.status_code == 200
    body = res.json()
    assert body["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(body["shifts"]) == 31
    assert set(body["shifts"][0]) == {"date", "day", "night"}
    assert body["solverVersion"] and body["seed"] == 1
    assert isinstance(body["objective"]["total"], int)


def test_HTTP_불가능은_원인만():
    req = request()
    req["doctors"][0]["nCount"] = 0
    body = client.post("/solve/doctor", json=req).json()
    assert body == {"status": "INFEASIBLE", "causes": [{"kind": "COUNT"}], "wallTimeSec": body["wallTimeSec"]}


def test_HTTP_잘못된_버전은_422():
    bad = request()
    bad["contractVersion"] = 2
    assert client.post("/solve/doctor", json=bad).status_code == 422


def test_31일_달을_2초_안에_푼다():
    t0 = time.monotonic()
    out = solve_doctor(request())
    assert time.monotonic() - t0 < 2
    assert out["status"] == "OPTIMAL"

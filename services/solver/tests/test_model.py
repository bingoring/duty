from solver.model import solve

from .checks import hard_violations
from .factory import request


def test_기본_11월은_하드_위반_없이_풀린다():
    req = request()
    res = solve(req)
    assert res["status"] in ("OPTIMAL", "FEASIBLE")
    assert hard_violations(req, res) == []
    assert len(res["cells"]) == 10 * 30


def test_같은_입력과_시드면_같은_안():
    a = solve(request(seed=7, time_limit=4))
    b = solve(request(seed=7, time_limit=4))
    assert a["cells"] == b["cells"]


def test_시드가_다르면_다른_안():
    a = solve(request(seed=1, time_limit=4))
    b = solve(request(seed=2, time_limit=4))
    assert a["cells"] != b["cells"]


def test_고정_칸은_그대로_두고_신청은_들어준다():
    req = request()
    n1 = req["nurses"][0]
    n1["fixed"] = [{"date": "2026-11-10", "code": "AL"}, {"date": "2026-11-11", "code": "LEAVE"}]
    n1["requests"] = [
        {"date": "2026-11-20", "options": ["OFF"]},
        {"date": "2026-11-21", "options": ["D", "E"]},
    ]
    res = solve(req)
    assert hard_violations(req, res) == []
    cell = {(c["userId"], c["date"]): c for c in res["cells"]}
    assert cell[("n1", "2026-11-10")]["code"] == "AL"
    assert cell[("n1", "2026-11-11")]["code"] == "LEAVE"
    assert cell[("n1", "2026-11-20")]["code"] == "OFF"
    assert cell[("n1", "2026-11-21")]["code"] in ("D", "E")


def test_전월_말_N_두_개면_1일_N은_한_개까지():
    req = request()
    req["prevTail"] = [
        {"userId": "n1", "date": "2026-10-30", "code": "N"},
        {"userId": "n1", "date": "2026-10-31", "code": "N"},
    ]
    # 11/1·11/2 둘 다 N을 원해도 연속 N 3개 상한이 이긴다
    req["nurses"][0]["requests"] = [
        {"date": "2026-11-01", "options": ["N"]},
        {"date": "2026-11-02", "options": ["N"]},
    ]
    res = solve(req)
    assert hard_violations(req, res) == []
    codes = {c["date"]: c["code"] for c in res["cells"] if c["userId"] == "n1"}
    assert not (codes["2026-11-01"] == "N" and codes["2026-11-02"] == "N")


def test_다음_달_초_확정_칸과_이어지는_금지_패턴을_피한다():
    req = request()
    # 12월이 먼저 확정됨: n1 12/1 D → 11/30 E면 E-D
    req["nextHead"] = [{"userId": "n1", "date": "2026-12-01", "code": "D"}]
    req["nurses"][0]["requests"] = [{"date": "2026-11-30", "options": ["E"]}]
    res = solve(req)
    assert hard_violations(req, res) == []
    codes = {c["date"]: c["code"] for c in res["cells"] if c["userId"] == "n1"}
    assert codes["2026-11-30"] != "E"


def test_다음_달_안에서만_생긴_위반은_이번_달_생성을_막지_않는다():
    req = request()
    req["nextHead"] = [
        {"userId": "n1", "date": "2026-12-01", "code": "E"},
        {"userId": "n1", "date": "2026-12-02", "code": "D"},
    ]
    res = solve(req)
    assert res["status"] in ("OPTIMAL", "FEASIBLE")
    assert hard_violations(req, res) == []


def test_잔여_N이_음수여도_나이트를_강제하지_않고_풀린다():
    # R-1: 관리자 「그래도 적용」 등으로 잔여 N이 음수가 되어도 슬리핑오프 한도는 0으로만 본다
    req = request()
    req["nurses"][0]["nightBankBefore"] = -8
    res = solve(req)
    assert res["status"] in ("OPTIMAL", "FEASIBLE")
    assert hard_violations(req, res) == []
    # 평일 D·주말 OFF로 고정해 N을 설 자리가 없어도(예전에는 N 5개 강제 → 불가능) 풀린다
    req["nurses"][0]["nightBankBefore"] = -5
    red = set(req["redDays"])
    req["nurses"][0]["fixed"] = [{"date": d, "code": "OFF" if d in red else "D"} for d in req["days"]]
    res = solve(req)
    assert res["status"] in ("OPTIMAL", "FEASIBLE")
    assert hard_violations(req, res) == []


def test_3인_근무_신규는_인원에_세지_않고_프리셉터와_같은_근무():
    req = request()
    req["trainings"] = [
        {
            "traineeId": "n10",
            "preceptorId": "n2",
            "startDate": "2026-11-02",
            "endDate": "2027-02-01",
            "tripleUntil": "2026-11-22",
            "tripleNightsLeft": 3,
        }
    ]
    res = solve(req)
    assert hard_violations(req, res) == []


def test_목표_OFF가_공평하게_나뉜다():
    req = request()
    res = solve(req)
    # 인원이 넉넉한 달: 모두 목표 OFF(9)를 받는다
    assert res["objective"]["terms"]["offShortMax"] == 0


def test_인원이_모자라면_불가능과_원인을_돌려준다():
    req = request(time_limit=5)
    for n in req["nurses"][:7]:
        n["fixed"] = [{"date": d, "code": "LEAVE"} for d in ("2026-11-17", "2026-11-18")]
    res = solve(req)
    assert res["status"] == "INFEASIBLE"
    assert res["causes"]
    assert any(c["group"] in ("STAFF", "KTASS", "FIXED") for c in res["causes"])

"""응급실 의사 근무표 CP-SAT 모델 (3-7d). 하루 D 1명·N 1명, 같은 의사가 둘 다 하면 올데이."""

from __future__ import annotations

import os
import random
import time
from typing import Any

from ortools.sat.python import cp_model

DOCTOR_VERSION = "0.1.0"
SHIFTS = ("D", "N")
# 권고 항목 가중치. tieBreak 계수(0..TIE_MAX)의 한 달 합(최대 62×3=186)이 가장 작은 단위(300)보다 작아
# 시드는 다른 항목이 같은 안들 사이에서만 고른다
WEIGHTS = {"requestMiss": 1000, "requestMissMax": 500, "allDayOut": 300, "nightToDay": 400, "tieBreak": 1}
TIE_MAX = 3


class _Model:
    def __init__(self, req: dict, diagnose: bool = False) -> None:
        self.req = req
        self.m = cp_model.CpModel()
        self.days: list[str] = req["days"]
        self.idx = {d: t for t, d in enumerate(self.days)}
        self.docs = [d["id"] for d in req["doctors"]]
        self.x: dict[tuple[str, int, str], cp_model.IntVar] = {}
        self.allday: dict[tuple[str, int], cp_model.IntVar] = {}
        # 진단용: (의사, 날짜) 고정 조건 묶음 → 가정 리터럴
        self.groups: dict[tuple[str, str], cp_model.IntVar] = {}
        self.terms: dict[str, Any] = {}
        self.diagnose = diagnose

    def build(self) -> _Model:
        m, n = self.m, len(self.days)
        for i in self.docs:
            for t in range(n):
                for s in SHIFTS:
                    self.x[(i, t, s)] = m.new_bool_var(f"x_{i}_{t}_{s}")
                d, nn = self.x[(i, t, "D")], self.x[(i, t, "N")]
                a = m.new_bool_var(f"a_{i}_{t}")
                m.add_multiplication_equality(a, [d, nn])
                self.allday[(i, t)] = a
        for t in range(n):
            for s in SHIFTS:
                m.add_exactly_one(self.x[(i, t, s)] for i in self.docs)
        for doc in self.req["doctors"]:
            i = doc["id"]
            m.add(sum(self.x[(i, t, "D")] for t in range(n)) == doc["dCount"])
            m.add(sum(self.x[(i, t, "N")] for t in range(n)) == doc["nCount"])
            self._fixed(doc)
        if not self.diagnose:
            self._soft()
        return self

    def _fixed(self, doc: dict) -> None:
        i = doc["id"]
        for f in doc["fixed"]:
            t = self.idx.get(f["date"])
            if t is None:
                continue
            d, nn = self.x[(i, t, "D")], self.x[(i, t, "N")]
            if f["type"] == "require":
                ct = {"D": d == 1, "N": nn == 1, "ANY": d + nn >= 1}[f["shift"]]
            else:
                ct = {"D": d == 0, "N": nn == 0, "ANY": d + nn == 0}[f["shift"]]
            c = self.m.add(ct)
            if self.diagnose:
                key = (i, f["date"])
                if key not in self.groups:
                    self.groups[key] = self.m.new_bool_var(f"g_{i}_{f['date']}")
                c.only_enforce_if(self.groups[key])

    def _soft(self) -> None:
        m, n = self.m, len(self.days)
        misses: dict[str, list] = {}
        all_out: list = []
        night_day: list = []
        for doc in self.req["doctors"]:
            i = doc["id"]
            mine = misses.setdefault(i, [])
            for r in doc["requests"]:
                t = self.idx.get(r["date"])
                if t is None:
                    continue
                d, nn, a = self.x[(i, t, "D")], self.x[(i, t, "N")], self.allday[(i, t)]
                # 네 상태는 서로 배타 → 고르지 않은 상태 지시식의 합이 곧 0/1 미준수
                state = {"O": 1 - d - nn + a, "D": d - a, "N": nn - a, "ALLDAY": a}
                bad = [e for k, e in state.items() if k not in r["options"]]
                if bad:
                    mine.append(sum(bad))
            total_a = sum(self.allday[(i, t)] for t in range(n))
            if doc["allDayMin"] is not None:
                u = m.new_int_var(0, n, f"under_{i}")
                m.add_max_equality(u, [doc["allDayMin"] - total_a, 0])
                all_out.append(u)
            if doc["allDayMax"] is not None:
                o = m.new_int_var(0, n, f"over_{i}")
                m.add_max_equality(o, [total_a - doc["allDayMax"], 0])
                all_out.append(o)
            for t in range(n - 1):
                b = m.new_bool_var(f"nd_{i}_{t}")
                m.add_multiplication_equality(b, [self.x[(i, t, "N")], self.x[(i, t + 1, "D")]])
                night_day.append(b)
            if self.req.get("prevLastNight") == i:
                night_day.append(self.x[(i, 0, "D")])
        miss_max = m.new_int_var(0, max([len(v) for v in misses.values()] + [0]), "miss_max")
        m.add_max_equality(miss_max, [sum(v) for v in misses.values()] + [0])
        rng = random.Random(self.req["seed"])
        tie = [rng.randint(0, TIE_MAX) * v for _, v in sorted(self.x.items())]
        self.terms = {
            "requestMiss": [e for v in misses.values() for e in v],
            "requestMissMax": [miss_max],
            "allDayOut": all_out,
            "nightToDay": night_day,
            "tieBreak": tie,
        }
        m.minimize(sum(WEIGHTS[k] * sum(v) for k, v in self.terms.items() if v))


def _solver(req: dict, time_limit: float) -> cp_model.CpSolver:
    s = cp_model.CpSolver()
    # interleave_search는 병렬이어도 결정적이다. 결정적 시간으로 멈추고 벽시계는 안전장치
    s.parameters.num_workers = 4
    s.parameters.interleave_search = True
    s.parameters.random_seed = req["seed"] % (2**31)
    s.parameters.max_deterministic_time = time_limit * 4
    s.parameters.max_time_in_seconds = time_limit * float(os.environ.get("SOLVER_WALL_FACTOR", "1.5"))
    return s


def solve_doctor(req: dict) -> dict:
    t0 = time.monotonic()

    def wall() -> float:
        return round(time.monotonic() - t0, 3)

    n = len(req["days"])
    if sum(d["dCount"] for d in req["doctors"]) != n or sum(d["nCount"] for d in req["doctors"]) != n:
        return {"status": "INFEASIBLE", "causes": [{"kind": "COUNT"}], "wallTimeSec": wall()}
    b = _Model(req).build()
    s = _solver(req, req["timeLimitSec"])
    status = s.solve(b.m)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        shifts = []
        for t, date in enumerate(b.days):
            who = {sh: next(i for i in b.docs if s.boolean_value(b.x[(i, t, sh)])) for sh in SHIFTS}
            shifts.append({"date": date, "day": who["D"], "night": who["N"]})
        terms = {k: int(sum(s.value(e) for e in v)) for k, v in b.terms.items()}
        return {
            "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            "shifts": shifts,
            "objective": {"total": int(s.objective_value), "terms": terms},
            "wallTimeSec": wall(),
            "seed": req["seed"],
            "solverVersion": DOCTOR_VERSION,
        }
    if status == cp_model.INFEASIBLE:
        return {"status": "INFEASIBLE", "causes": diagnose(req), "wallTimeSec": wall()}
    return {"status": "UNKNOWN", "wallTimeSec": wall()}


def diagnose(req: dict) -> list[dict]:
    """(의사, 날짜) 고정 조건 묶음을 가정 리터럴로 걸어 불가능의 충분 원인을 찾는다. 못 찾으면 COUNT."""
    b = _Model(req, diagnose=True).build()
    keys = sorted(b.groups, key=lambda k: (k[1], k[0]))
    b.m.add_assumptions([b.groups[k] for k in keys])
    s = _solver(req, min(10.0, req["timeLimitSec"]))
    s.parameters.cp_model_presolve = False
    s.parameters.num_workers = 1
    s.parameters.interleave_search = False
    if s.solve(b.m) != cp_model.INFEASIBLE:
        return [{"kind": "COUNT"}]
    index = {b.groups[k].index: k for k in keys}
    found = sorted(
        (index[i] for i in s.sufficient_assumptions_for_infeasibility() if i in index),
        key=lambda k: (k[1], k[0]),
    )
    return [{"kind": "FIXED", "userId": u, "date": d} for u, d in found] or [{"kind": "COUNT"}]

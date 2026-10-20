"""응급실 의사 근무표 CP-SAT 모델 (3-7d). 하루 D 1명·N 1명, 같은 의사가 둘 다 하면 올데이.

3-11: 규칙마다 필수(hard = 제약)·권고(soft = 벌점)를 요청의 severity가 정한다.
매일 D1·N1과 재직 기간은 늘 필수.
금지 패턴은 칸 기준 — D = Day 칸(올데이 포함) · N = Night 칸(올데이 포함) · AD = 올데이 · O = 근무 없음.
"""

from __future__ import annotations

import os
import random
import time
from datetime import date, timedelta
from typing import Any

from ortools.sat.python import cp_model

DOCTOR_VERSION = "0.2.0"
SHIFTS = ("D", "N")
DEFAULT_SEVERITY = {"COUNT": "hard", "FIXED": "hard", "ALLDAY_RANGE": "soft", "REQUEST": "soft"}
# 권고 항목 가중치. tieBreak 계수(0..TIE_MAX)의 한 달 합(최대 62×3=186)이 가장 작은 단위(300)보다 작아
# 시드는 다른 항목이 같은 안들 사이에서만 고른다. 권고로 바꾼 개수·고정 조건은 다른 권고보다 무겁다
WEIGHTS = {
    "requestMiss": 1000,
    "requestMissMax": 500,
    "allDayOut": 300,
    "pattern": 400,
    "fixedMiss": 2000,
    "countDev": 3000,
    "tieBreak": 1,
}
TIE_MAX = 3
DIAG_ORDER = {"FIXED": 0, "REQUEST": 1, "ALLDAY_RANGE": 2, "PATTERN": 3}


def _shift_date(iso: str, n: int) -> str:
    return (date.fromisoformat(iso) + timedelta(days=n)).isoformat()


class _Model:
    def __init__(self, req: dict, diagnose: bool = False) -> None:
        self.req = req
        self.m = cp_model.CpModel()
        self.days: list[str] = req["days"]
        self.idx = {d: t for t, d in enumerate(self.days)}
        self.docs = [d["id"] for d in req["doctors"]]
        self.sev = DEFAULT_SEVERITY | (req.get("severity") or {})
        self.prev = {r["date"]: r for r in req.get("prevShifts") or []}
        self.x: dict[tuple[str, int, str], cp_model.IntVar] = {}
        self.allday: dict[tuple[str, int], cp_model.IntVar] = {}
        # 진단용: (종류, 의사, 날짜|"") 필수 규칙 묶음 → 가정 리터럴
        self.groups: dict[tuple[str, str, str], cp_model.IntVar] = {}
        self.misses: dict[str, list] = {}
        self.terms: dict[str, list] = {k: [] for k in WEIGHTS}
        self.diagnose = diagnose

    def _add(self, ct: Any, key: tuple[str, str, str]) -> None:
        c = self.m.add(ct)
        if self.diagnose:
            if key not in self.groups:
                self.groups[key] = self.m.new_bool_var(f"g_{'_'.join(key)}")
            c.only_enforce_if(self.groups[key])

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
            self._employment(doc)
            self._count(doc)
            self._fixed(doc)
            self._requests(doc)
            self._allday(doc)
            self._patterns(doc)
        if not self.diagnose:
            self._objective()
        return self

    def _employment(self, doc: dict) -> None:
        # 3-11 8: 재직 기간 밖 날은 늘 0 (필수)
        i, lo, hi = doc["id"], doc.get("employedFrom"), doc.get("employedTo")
        for t, d in enumerate(self.days):
            if (lo and d < lo) or (hi and d > hi):
                for s in SHIFTS:
                    self.m.add(self.x[(i, t, s)] == 0)

    def _count(self, doc: dict) -> None:
        m, n, i = self.m, len(self.days), doc["id"]
        for s, key in (("D", "dCount"), ("N", "nCount")):
            total = sum(self.x[(i, t, s)] for t in range(n))
            if self.sev["COUNT"] == "hard":
                m.add(total == doc[key])
            elif not self.diagnose:
                u = m.new_int_var(0, n, f"dev_{i}_{s}")
                m.add_abs_equality(u, total - doc[key])
                self.terms["countDev"].append(u)

    def _state(self, i: str, t: int) -> dict[str, Any]:
        d, nn, a = self.x[(i, t, "D")], self.x[(i, t, "N")], self.allday[(i, t)]
        # 네 상태는 서로 배타 → 각 지시식은 0/1
        return {"O": 1 - d - nn + a, "D": d - a, "N": nn - a, "ALLDAY": a}

    def _fixed(self, doc: dict) -> None:
        i = doc["id"]
        hard = self.sev["FIXED"] == "hard"
        for f in doc["fixed"]:
            t = self.idx.get(f["date"])
            if t is None:
                continue
            d, nn, a = self.x[(i, t, "D")], self.x[(i, t, "N")], self.allday[(i, t)]
            hit = {"D": d, "N": nn, "ANY": d + nn - a}[f["shift"]]
            if hard:
                self._add(hit == (1 if f["type"] == "require" else 0), ("FIXED", i, f["date"]))
            elif not self.diagnose:
                self.terms["fixedMiss"].append(1 - hit if f["type"] == "require" else hit)

    def _requests(self, doc: dict) -> None:
        i = doc["id"]
        hard = self.sev["REQUEST"] == "hard"
        mine = self.misses.setdefault(i, [])
        for r in doc["requests"]:
            t = self.idx.get(r["date"])
            if t is None:
                continue
            # 고르지 않은 상태 지시식의 합이 곧 0/1 미준수
            bad = [e for k, e in self._state(i, t).items() if k not in r["options"]]
            if not bad:
                continue
            if hard:
                self._add(sum(bad) == 0, ("REQUEST", i, r["date"]))
            elif not self.diagnose:
                mine.append(sum(bad))

    def _allday(self, doc: dict) -> None:
        m, n, i = self.m, len(self.days), doc["id"]
        total_a = sum(self.allday[(i, t)] for t in range(n))
        lo, hi = doc["allDayMin"], doc["allDayMax"]
        if self.sev["ALLDAY_RANGE"] == "hard":
            if lo is not None:
                self._add(total_a >= lo, ("ALLDAY_RANGE", i, ""))
            if hi is not None:
                self._add(total_a <= hi, ("ALLDAY_RANGE", i, ""))
            return
        if self.diagnose:
            return
        if lo is not None:
            u = m.new_int_var(0, n, f"under_{i}")
            m.add_max_equality(u, [lo - total_a, 0])
            self.terms["allDayOut"].append(u)
        if hi is not None:
            o = m.new_int_var(0, n, f"over_{i}")
            m.add_max_equality(o, [total_a - hi, 0])
            self.terms["allDayOut"].append(o)

    def _prev_hit(self, i: str, iso: str, tok: str) -> bool | None:
        """전월 날의 토큰 판정. 기록이 없으면 None(그 날이 든 창은 보지 않는다)."""
        row = self.prev.get(iso)
        if row is None:
            return None
        d, nn = row.get("day") == i, row.get("night") == i
        return {"D": d, "N": nn, "AD": d and nn, "O": not d and not nn}[tok]

    def _tok(self, i: str, t: int, tok: str) -> Any:
        d, nn, a = self.x[(i, t, "D")], self.x[(i, t, "N")], self.allday[(i, t)]
        return {"D": d, "N": nn, "AD": a, "O": 1 - d - nn + a}[tok]

    def _patterns(self, doc: dict) -> None:
        m, n, i = self.m, len(self.days), doc["id"]
        for p in self.req.get("patterns") or []:
            toks, k = p["pattern"], len(p["pattern"])
            hard = p["severity"] == "hard"
            if not hard and self.diagnose:
                continue
            # 창의 마지막 날은 이 달 안. 앞쪽이 전월이면 prevShifts로 판정한다
            for s in range(-(k - 1), n - k + 1):
                exprs, dead = [], False
                for j, tok in enumerate(toks):
                    t = s + j
                    if t >= 0:
                        exprs.append(self._tok(i, t, tok))
                    elif not self._prev_hit(i, _shift_date(self.days[0], t), tok):
                        dead = True  # 모르는 날이거나 이미 어긋남
                        break
                if dead:
                    continue
                kv = len(exprs)
                if hard:
                    self._add(sum(exprs) <= kv - 1, ("PATTERN", i, ""))
                else:
                    v = m.new_bool_var(f"pat_{i}_{'-'.join(toks)}_{s}")
                    m.add(v >= sum(exprs) - (kv - 1))
                    self.terms["pattern"].append(v)

    def _objective(self) -> None:
        m = self.m
        misses = self.misses
        miss_max = m.new_int_var(0, max([len(v) for v in misses.values()] + [0]), "miss_max")
        m.add_max_equality(miss_max, [sum(v) for v in misses.values()] + [0])
        rng = random.Random(self.req["seed"])
        self.terms["requestMiss"] = [e for v in misses.values() for e in v]
        self.terms["requestMissMax"] = [miss_max]
        self.terms["tieBreak"] = [rng.randint(0, TIE_MAX) * v for _, v in sorted(self.x.items())]
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
    count_hard = (DEFAULT_SEVERITY | (req.get("severity") or {}))["COUNT"] == "hard"
    if count_hard and (
        sum(d["dCount"] for d in req["doctors"]) != n or sum(d["nCount"] for d in req["doctors"]) != n
    ):
        return {"status": "INFEASIBLE", "causes": [{"kind": "COUNT"}], "wallTimeSec": wall()}
    b = _Model(req).build()
    s = _solver(req, req["timeLimitSec"])
    status = s.solve(b.m)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        shifts = []
        for t, iso in enumerate(b.days):
            who = {sh: next(i for i in b.docs if s.boolean_value(b.x[(i, t, sh)])) for sh in SHIFTS}
            shifts.append({"date": iso, "day": who["D"], "night": who["N"]})
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
    """필수 규칙 묶음(고정 조건·신청은 (의사, 날짜), 올데이 범위·금지 패턴은 의사별)을 가정 리터럴로 걸어
    불가능의 충분 원인을 찾는다. 못 찾으면 COUNT."""
    b = _Model(req, diagnose=True).build()

    def order(k: tuple[str, str, str]) -> tuple:
        return (k[2], DIAG_ORDER[k[0]], k[1])

    keys = sorted(b.groups, key=order)
    b.m.add_assumptions([b.groups[k] for k in keys])
    s = _solver(req, min(10.0, req["timeLimitSec"]))
    s.parameters.cp_model_presolve = False
    s.parameters.num_workers = 1
    s.parameters.interleave_search = False
    if s.solve(b.m) != cp_model.INFEASIBLE:
        return [{"kind": "COUNT"}]
    index = {b.groups[k].index: k for k in keys}
    found = sorted((index[i] for i in s.sufficient_assumptions_for_infeasibility() if i in index), key=order)
    causes = [{"kind": k, "userId": u, **({"date": d} if d else {})} for k, u, d in found]
    return causes or [{"kind": "COUNT"}]

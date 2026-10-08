"""CP-SAT 근무표 모델 (Build Spec 2-6 business-rules §2·§4, business-logic-model §4).

하드 제약은 TS 검사기(@duty/domain checkSchedule)의 하드 규칙과 같은 판정이어야 한다.
불일치는 web 쪽 교차 검증 테스트가 잡는다.
"""

from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from itertools import combinations
from typing import Any

from ortools.sat.python import cp_model

from .weights import REPEAT_PAIR_MIN, REQUEST_MISS_BEFORE_DIV, WEIGHTS

VERSION = "0.1.0"
DUTIES = ("D", "E", "N")
WORK = ("D", "E", "N", "S")
REST = ("OFF", "AL", "LEAVE")
FREE = ("D", "E", "N", "OFF")  # 솔버가 고르는 코드
REVERSE = (("D", "N"), ("E", "D"), ("N", "E"))  # D→E→N 순환의 역방향
COUNTED_OFF = {None, "regular", "edu_cont", "edu_union"}  # 정산 actualOff에 드는 OFF

Lit = Any  # cp_model 불리언 리터럴


def _d(iso: str) -> date:
    return date.fromisoformat(iso)


def _iso(d: date) -> str:
    return d.isoformat()


@dataclass
class Built:
    model: cp_model.CpModel
    x: dict[tuple[str, str, str], Lit]
    sleeping: dict[tuple[str, str], Lit]
    fixed: dict[tuple[str, str], dict]
    terms: dict[str, list] = field(default_factory=dict)
    groups: dict[str, Lit] = field(default_factory=dict)


class Builder:
    def __init__(self, req: dict, diagnose: bool = False):
        self.req = req
        self.diagnose = diagnose
        self.m = cp_model.CpModel()
        self.true = self.m.new_bool_var("true")
        self.m.add(self.true == 1)
        self.false = ~self.true
        self.days: list[str] = req["days"]
        self.month = set(self.days)
        tail = sorted({c["date"] for c in req["prevTail"]})
        head = sorted({c["date"] for c in req.get("nextHead") or []})
        first, last = _d(self.days[0]), _d(self.days[-1])
        # 전월 꼬리는 월초 바로 앞, 다음 달 머리(이미 확정된 달)는 월말 바로 뒤의 연속 날짜로 둔다
        # (칸이 없는 날은 '칸 없음')
        span = (first - _d(tail[0])).days if tail else 0
        after = (_d(head[-1]) - last).days if head else 0
        self.timeline = (
            [_iso(first - timedelta(days=span - i)) for i in range(span)]
            + self.days
            + [_iso(last + timedelta(days=i + 1)) for i in range(after)]
        )
        self.red = set(req["redDays"])
        self.nurses = req["nurses"]
        self.byId = {n["id"]: n for n in self.nurses}
        # 대상 월 밖의 고정 칸: 전월 꼬리 + 다음 달 머리
        self.tail = {(c["userId"], c["date"]): c for c in req["prevTail"] + (req.get("nextHead") or [])}
        self.x: dict[tuple[str, str, str], Lit] = {}
        self.sleeping: dict[tuple[str, str], Lit] = {}
        self.fixed: dict[tuple[str, str], dict] = {}
        self.work_days: dict[str, set[str]] = {}
        self.groups: dict[str, Lit] = {}
        self.terms: dict[str, list] = {k: [] for k in WEIGHTS}

    # ---- 리터럴 도우미 -------------------------------------------------
    def guard(self, key: str) -> list[Lit]:
        """진단 모드에서 제약 그룹을 가정 리터럴로 묶는다."""
        if not self.diagnose:
            return []
        if key not in self.groups:
            self.groups[key] = self.m.new_bool_var(f"g:{key}")
        return [self.groups[key]]

    def has_cell(self, n: str, d: str) -> bool:
        if d in self.month:
            return d in self.work_days.get(n, set())
        return (n, d) in self.tail

    def is_(self, n: str, d: str, code: str) -> Lit:
        if d not in self.month:
            c = self.tail.get((n, d))
            return self.true if c and c["code"] == code else self.false
        return self.x.get((n, d, code), self.false)

    def rest(self, n: str, d: str) -> Lit:
        if d not in self.month:
            c = self.tail.get((n, d))
            return self.true if c and c["code"] in REST else self.false
        lits = [self.x[(n, d, c)] for c in REST if (n, d, c) in self.x]
        return self._or(lits)

    def work(self, n: str, d: str) -> Lit:
        if d not in self.month:
            c = self.tail.get((n, d))
            return self.true if c and c["code"] in WORK else self.false
        return self._or([self.x[(n, d, c)] for c in WORK if (n, d, c) in self.x])

    def token(self, n: str, d: str, part: str) -> Lit:
        return self.rest(n, d) if part == "OFF" else self.is_(n, d, part)

    def _or(self, lits: list[Lit]) -> Lit:
        lits = [v for v in lits if v is not self.false]
        if not lits:
            return self.false
        if len(lits) == 1:
            return lits[0]
        b = self.m.new_bool_var("")
        self.m.add_max_equality(b, lits)
        return b

    def _and(self, lits: list[Lit]) -> Lit:
        if any(v is self.false for v in lits):
            return self.false
        lits = [v for v in lits if v is not self.true]
        if not lits:
            return self.true
        if len(lits) == 1:
            return lits[0]
        b = self.m.new_bool_var("")
        self.m.add_min_equality(b, lits)
        return b

    # ---- 칸 변수 ------------------------------------------------------
    def cells(self) -> None:
        for n in self.nurses:
            nid = n["id"]
            fixed = {f["date"]: f for f in n["fixed"]}
            self.work_days[nid] = set(n["workDays"])
            for d in n["workDays"]:
                f = fixed.get(d)
                codes = list(FREE) + ([f["code"]] if f and f["code"] not in FREE else [])
                lits = {c: self.m.new_bool_var(f"x:{nid}:{d}:{c}") for c in codes}
                self.m.add_exactly_one(lits.values())
                for c, v in lits.items():
                    self.x[(nid, d, c)] = v
                if f:
                    self.fixed[(nid, d)] = f
                    self.m.add(lits[f["code"]] == 1).only_enforce_if(self.guard(f"FIXED:{nid}"))
                else:
                    s = self.m.new_bool_var(f"sl:{nid}:{d}")
                    self.m.add_implication(s, lits["OFF"])
                    self.sleeping[(nid, d)] = s

    # ---- 인원 ----------------------------------------------------------
    def trainings_on(self, n: str, d: str) -> list[dict]:
        return [
            t for t in self.req["trainings"] if t["traineeId"] == n and t["startDate"] <= d <= t["endDate"]
        ]

    def staffing(self) -> None:
        r = self.req["rules"]
        heads = self.req["heads"]
        # 2-11 R-HEAD-1·3: flex(기본 S) 칸은 솔버가 D로 바꿀 수 있다. 바꾸면 D 인원에 세고 큰 벌점(headFill)
        head_at = {(h["id"], c["date"]): c["code"] for h in heads for c in h["cells"] if not c.get("flex")}
        self.head_d: dict[tuple[str, str], Lit] = {}
        for h in heads:
            for c in h["cells"]:
                if c.get("flex") and c["date"] in self.month:
                    v = self.m.new_bool_var(f"hd:{h['id']}:{c['date']}")
                    self.head_d[(h["id"], c["date"])] = v
                    if not self.diagnose:
                        self.terms["headFill"].append(v)
        # 3인 근무 기간 뒤 처음 서는 N (R-STAFF-5): 트레이닝별 누적 N 수로 판정
        triple_n: dict[tuple[str, str], Lit] = {}
        for t in self.req["trainings"]:
            left = t["tripleNightsLeft"]
            if left == 0:
                continue
            tid = t["traineeId"]
            prior: list[Lit] = []
            for d in self.days:
                if not (t["tripleUntil"] < d <= t["endDate"]):
                    continue
                is_n = self.is_(tid, d, "N")
                if is_n is self.false:
                    continue
                if prior:
                    lt = self.m.new_bool_var("")
                    self.m.add(sum(prior) <= left - 1).only_enforce_if(lt)
                    self.m.add(sum(prior) >= left).only_enforce_if(~lt)
                else:
                    lt = self.true
                tn = self._and([is_n, lt])
                triple_n[(tid, d)] = self._or([triple_n.get((tid, d), self.false), tn])
                prior.append(is_n)

        self.counted: dict[tuple[str, str], list[tuple[str, Lit]]] = {}
        for d in self.days:
            for s in DUTIES:
                members: list[tuple[str, Lit]] = []
                kt: list[Lit] = []
                for n in self.nurses:
                    nid = n["id"]
                    lit = self.is_(nid, d, s)
                    if lit is self.false:
                        continue
                    trs = self.trainings_on(nid, d)
                    if any(d <= t["tripleUntil"] for t in trs):
                        continue
                    if s == "N" and (nid, d) in triple_n:
                        lit = self._and([lit, ~triple_n[(nid, d)]])
                    members.append((nid, lit))
                    if n["kTass"] and not trs:
                        kt.append(lit)
                self.counted[(d, s)] = members
                h = sum(1 for hd in heads if head_at.get((hd["id"], d)) == s)
                hk = sum(1 for hd in heads if hd["kTass"] and head_at.get((hd["id"], d)) == s)
                flex = [
                    (hd, self.head_d[(hd["id"], d)])
                    for hd in heads
                    if s == "D" and (hd["id"], d) in self.head_d
                ]
                cnt = self.true * 0 + sum(v for _, v in members)
                kts = self.true * 0 + sum(kt)
                fx = self.true * 0 + sum(v for _, v in flex)
                fxk = self.true * 0 + sum(v for hd, v in flex if hd["kTass"])
                self.m.add(cnt + fx + h >= r["minStaff"]).only_enforce_if(self.guard(f"STAFF:{d}:{s}"))
                self.m.add(kts + fxk + hk >= r["minKTass"]).only_enforce_if(self.guard(f"KTASS:{d}:{s}"))
                if self.diagnose:
                    continue
                # S-JUNIOR-ONLY: 그날 고연차 수간호사가 그 근무면 면제
                if self.req["priorities"]["avoidJuniorOnly"]:
                    head_senior = any(not hd["junior"] and head_at.get((hd["id"], d)) == s for hd in heads)
                    if not head_senior:
                        seniors = [v for nid, v in members if not self.byId[nid]["junior"]]
                        seniors += [v for hd, v in flex if not hd["junior"]]
                        self.terms["juniorOnly"].append(~self._or(seniors))

    # ---- 트레이닝 -------------------------------------------------------
    def training(self) -> None:
        for i, t in enumerate(self.req["trainings"]):
            a, b = t["traineeId"], t["preceptorId"]
            for d in self.days:
                if not (t["startDate"] <= d <= t["endDate"]):
                    continue
                if not (self.has_cell(a, d) and self.has_cell(b, d)):
                    continue
                fa, fb = self.fixed.get((a, d)), self.fixed.get((b, d))
                if any(f and f["code"] in ("AL", "LEAVE") for f in (fa, fb)):
                    continue
                g = self.guard(f"TRAINING:{i}")
                for c in WORK:
                    self.m.add(self.is_(a, d, c) == self.is_(b, d, c)).only_enforce_if(g)

    # ---- 사람 단위 하드 -------------------------------------------------
    def person(self) -> None:
        r = self.req["rules"]
        rest_h = self.req["restHours"]
        tl = self.timeline
        first_month = tl.index(self.days[0])
        last_month = tl.index(self.days[-1])

        # 대상 월에 한 칸이라도 걸친 창만 검사한다(월 밖에서만 생긴 위반은 이 생성이 고칠 수 없다)
        def touches(i: int, k: int) -> bool:
            return i + k - 1 >= first_month and i <= last_month

        for n in self.nurses:
            nid = n["id"]
            # H-PATTERN
            for pattern in r["forbiddenPatterns"]:
                parts = pattern.split("-")
                k = len(parts)
                for i in range(len(tl) - k + 1):
                    if not touches(i, k):
                        continue
                    lits = [self.token(nid, tl[i + j], parts[j]) for j in range(k)]
                    if any(v is self.false for v in lits):
                        continue
                    self.m.add_bool_or([~v for v in lits])
            # H-REST
            for i in range(len(tl) - 1):
                if not touches(i, 2):
                    continue
                d1, d2 = tl[i], tl[i + 1]
                for a in WORK:
                    for b in WORK:
                        if a == b or rest_h[a][b] >= r["minRestHours"]:
                            continue
                        la, lb = self.is_(nid, d1, a), self.is_(nid, d2, b)
                        if la is self.false or lb is self.false:
                            continue
                        self.m.add_bool_or([~la, ~lb])
            # H-NIGHT-MAX
            nights = [self.is_(nid, d, "N") for d in self.days]
            self.m.add(sum(nights) <= n["nightMax"]).only_enforce_if(self.guard(f"NIGHT_MAX:{nid}"))
            # H-NIGHT-CONSEC: 길이 max+1 창에 N이 모두 들어가지 않게
            w = r["maxConsecutiveNight"] + 1
            g = self.guard(f"NIGHT_CONSEC:{nid}")
            for i in range(len(tl) - w + 1):
                if not touches(i, w):
                    continue
                lits = [self.is_(nid, tl[i + j], "N") for j in range(w)]
                if any(v is self.false for v in lits):
                    continue
                self.m.add_bool_or([~v for v in lits]).only_enforce_if(g)
            # H-OFF-CONSEC: 휴가(LEAVE)는 0으로 세되 연속을 끊지 않는다
            g = self.guard(f"OFF_CONSEC:{nid}")
            limit = r["maxConsecutiveOff"]
            for i in range(len(tl)):
                total, j = 0, i
                while j < len(tl) and total <= limit:
                    d = tl[j]
                    if not self.has_cell(nid, d):
                        break
                    total += 0 if self._is_leave(nid, d) else 1
                    j += 1
                if total <= limit or not touches(i, j - i):
                    continue
                lits = [self.rest(nid, tl[q]) for q in range(i, j)]
                if any(v is self.false for v in lits):
                    continue
                self.m.add_bool_or([~v for v in lits]).only_enforce_if(g)
            # H-SLEEPING: 슬리핑오프 수 × 기준 ≤ max(0, 잔여 N + 이번 달 N)
            # (잔여 N이 음수일 때 "N을 그만큼 서라"는 숨은 제약이 되지 않게 0 아래를 자른다, R-1)
            sl = [v for (u, _), v in self.sleeping.items() if u == nid]
            if sl:
                self.m.add(
                    r["sleepingOffPerN"] * sum(sl) <= self.night_avail(nid, n["nightBankBefore"], sum(nights))
                ).only_enforce_if(self.guard(f"SLEEPING:{nid}"))

    def night_avail(self, nid: str, bank: int, nights: Any) -> Any:
        """max(0, 잔여 N + 이번 달 N 합계식) — 사람마다 한 번만 만든다."""
        if not hasattr(self, "_avail"):
            self._avail: dict[str, Any] = {}
        if nid not in self._avail:
            v = self.m.new_int_var(0, 31 + max(0, bank), f"avail:{nid}")
            self.m.add_max_equality(v, [bank + nights, 0])
            self._avail[nid] = v
        return self._avail[nid]

    def _is_leave(self, n: str, d: str) -> bool:
        if d not in self.month:
            c = self.tail.get((n, d))
            return bool(c and c["code"] == "LEAVE")
        f = self.fixed.get((n, d))
        return bool(f and f["code"] == "LEAVE")

    # ---- 소프트 --------------------------------------------------------
    def soft(self) -> None:
        r = self.req["rules"]
        p = self.req["priorities"]
        off_short: list[Lit] = []
        miss_max: list = []
        for n in self.nurses:
            nid = n["id"]
            wd = n["workDays"]
            if not wd:
                continue
            # 공정성: 목표 OFF와 실제 OFF(정산 actualOff) 차이, 0.5 단위라 ×2
            actual = []
            fixed_off = 0
            for d in wd:
                f = self.fixed.get((nid, d))
                if f:
                    if f["code"] == "OFF" and f.get("offKind") in COUNTED_OFF:
                        fixed_off += 1
                else:
                    actual.append(self.x[(nid, d, "OFF")])
                    actual.append(-self.sleeping[(nid, d)])
            target2 = round(n["offTarget"] * 2)
            short = self.m.new_int_var(0, 200, f"short:{nid}")
            over = self.m.new_int_var(0, 200, f"over:{nid}")
            self.m.add(short >= target2 - 2 * (sum(actual) + fixed_off))
            self.m.add(over >= 2 * (sum(actual) + fixed_off) - target2)
            off_short.append(short)
            self.terms["offShort"].append(short)
            self.terms["offOver"].append(over)

            # 신청 (Q3): 한 사람에게 불충족이 몰리지 않게
            if p["requests"] and n["requests"]:
                misses = []
                for q in n["requests"]:
                    d = q["date"]
                    if d not in self.work_days[nid] or (nid, d) in self.fixed:
                        continue
                    sat = self._or([self.token(nid, d, o) for o in q["options"]])
                    misses.append(~sat)
                self.terms["requestMiss"].extend(misses)
                miss_max.append(sum(misses) + n["requestMissBefore"] // REQUEST_MISS_BEFORE_DIV)

            nights = sum(self.is_(nid, d, "N") for d in self.days)
            # S-NIGHT-TARGET
            if n["nightTarget"] is not None:
                ex = self.m.new_int_var(0, 31, "")
                self.m.add(ex >= nights - n["nightTarget"])
                self.terms["nightTarget"].append(ex)
            # 슬리핑오프: 한도만큼 주지 못한 수
            sl = [v for (u, _), v in self.sleeping.items() if u == nid]
            allowed = self.m.new_int_var(0, 31, "")
            per = r["sleepingOffPerN"]
            avail = self.night_avail(nid, n["nightBankBefore"], nights)
            self.m.add(per * allowed <= avail)
            self.m.add(avail <= per * allowed + per - 1)
            self.terms["sleepingShort"].append(allowed - sum(sl))

            # S-WEEKEND-PAIR · S-WEEKEND-CARRY (토요일이 속한 달로 센다)
            if p["weekendPair"]:
                pairs = []
                for d in self.days:
                    if _d(d).weekday() != 5:
                        continue
                    sun = _iso(_d(d) + timedelta(days=1))
                    sat_rest = self.rest(nid, d)
                    # 일요일이 다음 달이면 그 달 칸을 알 때만 함께 본다(모르면 달성 예정, TS와 같음)
                    if sun in self.month or (nid, sun) in self.tail:
                        pairs.append(self._and([sat_rest, self.rest(nid, sun)]))
                    else:
                        pairs.append(sat_rest)
                has = self._or(pairs)
                weight = 1 + n["weekendMissedStreak"]
                self.terms["weekendPair"].append(weight * (1 - has) if has is not self.false else weight)
                first = self.days[0]
                if n["weekendCarryIn"] and _d(first).weekday() == 6 and self.has_cell(nid, first):
                    self.terms["weekendCarry"].append(~self.rest(nid, first))

            # S-OFF-AFTER-N: N 뒤 쉬는 칸 1~(k−1)개 다음이 근무
            k = r["offAfterNight"]
            if p["offAfterNight"] and k >= 2:
                tl = self.timeline
                for i, d in enumerate(tl):
                    for rr in range(1, k):
                        if i + rr + 1 >= len(tl):
                            continue
                        span = tl[i : i + rr + 2]
                        if not any(x in self.month for x in span):
                            continue
                        lits = [self.is_(nid, d, "N")]
                        lits += [self.rest(nid, tl[i + q]) for q in range(1, rr + 1)]
                        lits.append(self.work(nid, tl[i + rr + 1]))
                        v = self._and(lits)
                        if v is not self.false:
                            self.terms["offAfterNight"].append(v)

            # S-WORK-CONSEC: 연속 근무 상한(권고). 실제 근무표에 6일 이상이 없다(R-1, DECISIONS 2026-10-08)
            mw = r.get("maxConsecutiveWork")
            if mw:
                tl = self.timeline
                lo, hi = tl.index(self.days[0]), tl.index(self.days[-1])
                for i in range(len(tl) - mw):
                    if i + mw < lo or i > hi:
                        continue
                    v = self._and([self.work(nid, tl[i + j]) for j in range(mw + 1)])
                    if v is not self.false:
                        self.terms["workConsec"].append(v)

            # S-ROTATION: D→E→N 순환의 역방향(D→N·E→D·N→E)을 쉬는 칸 0~2개 사이로 이어질 때 벌한다.
            # 실제 근무표에도 역방향이 있어 금지하지 않는다(DECISIONS 2026-10-08)
            for i, d in enumerate(self.days):
                for gap in range(3):
                    j = i + gap + 1
                    if j >= len(self.days):
                        break
                    mids = [self.rest(nid, self.days[i + 1 + k]) for k in range(gap)]
                    if any(v is self.false for v in mids):
                        continue
                    for a, b in REVERSE:
                        v = self._and([self.is_(nid, d, a), *mids, self.is_(nid, self.days[j], b)])
                        if v is not self.false:
                            self.terms["reverseRotation"].append(v)

            # S-SHIFT-BALANCE
            if n["balanceShiftTypes"]:
                cnt = {s: sum(self.is_(nid, d, s) for d in self.days) for s in DUTIES}
                tol = r["shiftBalanceTolerance"]
                ex = self.m.new_int_var(0, 31, "")
                for a in DUTIES:
                    for b in DUTIES:
                        if a != b:
                            self.m.add(ex >= cnt[a] - cnt[b] - tol)
                self.terms["shiftBalance"].append(ex)
                months = r["shiftBalanceWindowMonths"]
                before = n["shiftCountsBefore"]
                if months > 1 and sum(before.values()) > 0:
                    wtol = tol + months - 1
                    wex = self.m.new_int_var(0, 200, "")
                    for a in DUTIES:
                        for b in DUTIES:
                            if a != b:
                                self.m.add(wex >= cnt[a] + before[a] - cnt[b] - before[b] - wtol)
                    self.terms["shiftBalance"].append(wex)

        if off_short:
            m = self.m.new_int_var(0, 200, "offShortMax")
            self.m.add_max_equality(m, off_short)
            self.terms["offShortMax"].append(m)
        if miss_max:
            m = self.m.new_int_var(0, 100, "requestMissMax")
            for e in miss_max:
                self.m.add(m >= e)
            self.terms["requestMissMax"].append(m)

        # S-REPEAT-PAIR: 같은 날 같은 듀티 횟수의 임계 초과분 (트레이닝 쌍 제외)
        if p["minimizeRepeatPairs"]:
            ids = [n["id"] for n in self.nurses if n["workDays"]]
            for a, b in combinations(ids, 2):
                together = []
                for d in self.days:
                    if self._precepting(a, b, d):
                        continue
                    for s in DUTIES:
                        v = self._and([self.is_(a, d, s), self.is_(b, d, s)])
                        if v is not self.false:
                            together.append(v)
                if len(together) <= REPEAT_PAIR_MIN - 1:
                    continue
                ex = self.m.new_int_var(0, 100, "")
                self.m.add(ex >= sum(together) - (REPEAT_PAIR_MIN - 1))
                self.terms["repeatPair"].append(ex)

        # 시드별 동점 깨기
        rng = random.Random(self.req["seed"])
        for key in sorted(self.x):
            coef = rng.randint(0, 3)
            if coef:
                self.terms["tieBreak"].append(coef * self.x[key])

    def _precepting(self, a: str, b: str, d: str) -> bool:
        for t in self.req["trainings"]:
            if {t["traineeId"], t["preceptorId"]} == {a, b} and t["startDate"] <= d <= t["endDate"]:
                return True
        return False

    def build(self) -> Builder:
        self.cells()
        self.staffing()
        self.training()
        self.person()
        if not self.diagnose:
            self.soft()
            self.m.minimize(sum(WEIGHTS[k] * sum(v) for k, v in self.terms.items() if v))
        return self


def _solver(req: dict, time_limit: float) -> cp_model.CpSolver:
    s = cp_model.CpSolver()
    # interleave_search는 병렬이어도 결정적이다(같은 입력·시드 → 같은 안). 1스레드보다 해의 질이 크게 좋다
    s.parameters.num_workers = int(os.environ.get("SOLVER_WORKERS", "8"))
    s.parameters.interleave_search = True
    s.parameters.random_seed = req["seed"] % (2**31)
    # 결정성: 결정적 시간으로 멈춘다(벽시계로 멈추면 같은 시드라도 멈춘 지점이 달라진다).
    # 개발 머신(12코어)에서 벽시계 1초 ≈ 결정적 시간 5.3. 모델 조립까지 20초 안팎이 되도록 4로 둔다.
    # 느린 서버에서는 벽시계 1.5배가 안전장치다
    s.parameters.max_deterministic_time = time_limit * float(os.environ.get("SOLVER_DET_PER_SEC", "4"))
    s.parameters.max_time_in_seconds = time_limit * float(os.environ.get("SOLVER_WALL_FACTOR", "1.5"))
    return s


def _value(s: cp_model.CpSolver, e: Any) -> int:
    if isinstance(e, int):
        return e
    if isinstance(e, cp_model.IntVar) or not hasattr(e, "index"):
        return int(s.value(e))
    return int(s.boolean_value(e))


def solve(req: dict) -> dict:
    t0 = time.monotonic()
    b = Builder(req).build()
    s = _solver(req, req["timeLimitSec"])
    status = s.solve(b.m)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        cells = []
        for n in req["nurses"]:
            nid = n["id"]
            for d in n["workDays"]:
                f = b.fixed.get((nid, d))
                if f:
                    cell = {"userId": nid, "date": d, "code": f["code"]}
                    if f.get("offKind"):
                        cell["offKind"] = f["offKind"]
                else:
                    code = next(c for c in FREE if s.value(b.x[(nid, d, c)]))
                    cell = {"userId": nid, "date": d, "code": code}
                    if code == "OFF":
                        cell["offKind"] = "sleeping" if s.value(b.sleeping[(nid, d)]) else "regular"
                cells.append(cell)
        terms = {k: int(sum(_value(s, e) for e in v)) for k, v in b.terms.items()}
        fill = [{"userId": u, "date": d} for (u, d), v in sorted(b.head_d.items()) if s.boolean_value(v)]
        return {
            "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            "cells": cells,
            **({"headFill": fill} if fill else {}),
            "objective": {"total": int(s.objective_value), "terms": terms},
            "wallTimeSec": round(time.monotonic() - t0, 3),
            "seed": req["seed"],
            "solverVersion": VERSION,
        }
    if status == cp_model.INFEASIBLE:
        return {
            "status": "INFEASIBLE",
            "causes": diagnose(req),
            "wallTimeSec": round(time.monotonic() - t0, 3),
        }
    return {"status": "UNKNOWN", "wallTimeSec": round(time.monotonic() - t0, 3)}


def diagnose(req: dict) -> list[dict]:
    """하드 제약 그룹을 가정 리터럴로 묶어 불가능의 충분 원인을 찾는다 (business-logic-model §4)."""
    b = Builder(req, diagnose=True).build()
    keys = list(b.groups)
    b.m.add_assumptions([b.groups[k] for k in keys])
    s = _solver(req, min(10.0, req["timeLimitSec"]))
    s.parameters.cp_model_presolve = False
    s.parameters.num_workers = 1
    s.parameters.interleave_search = False
    status = s.solve(b.m)
    if status != cp_model.INFEASIBLE:
        # 진단 시간 안에 원인을 증명하지 못함 — 인원 부족으로 꾸며 내지 않고 비워 둔다(R-1)
        return []
    index = {b.groups[k].index: k for k in keys}
    causes = []
    for i in s.sufficient_assumptions_for_infeasibility():
        key = index.get(i)
        if key is None:
            continue
        group, *rest = key.split(":")
        c: dict = {"group": group}
        if group in ("STAFF", "KTASS"):
            c["date"], c["shift"] = rest
        elif group == "TRAINING":
            c["userId"] = req["trainings"][int(rest[0])]["traineeId"]
        else:
            c["userId"] = rest[0]
        causes.append(c)
    causes.sort(key=lambda c: (c.get("date", ""), c["group"], c.get("userId", "")))
    return causes

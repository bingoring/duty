"""테스트용 가상 병동 (가명 없음, id만). 2026년 11월: 1일이 일요일, 공휴일 없음."""

from __future__ import annotations

import copy
from datetime import date, timedelta

TIMES = {"D": (420, 930, False), "E": (870, 1380, False), "N": (1350, 450, True), "S": (540, 1080, False)}


def rest_hours() -> dict:
    out: dict = {}
    for a, (_, end, nxt) in TIMES.items():
        out[a] = {}
        for b, (start, _, _) in TIMES.items():
            out[a][b] = (1440 + start - (end + (1440 if nxt else 0))) / 60
    return out


def month_days(y: int, m: int) -> list[str]:
    d = date(y, m, 1)
    out = []
    while d.month == m:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def red_days(days: list[str]) -> list[str]:
    return [d for d in days if date.fromisoformat(d).weekday() >= 5]


KTASS = {"n1", "n2", "n3", "n4", "n6", "n7"}
JUNIOR = {"n8", "n9", "n10"}


def nurse(nid: str, days: list[str], target: float) -> dict:
    return {
        "id": nid,
        "kTass": nid in KTASS,
        "junior": nid in JUNIOR,
        "workDays": list(days),
        "fixed": [],
        "requests": [],
        "offTarget": target,
        "nightBankBefore": 0,
        "nightMax": 7,
        "nightTarget": 6,
        "weekendMissedStreak": 0,
        "weekendCarryIn": False,
        "shiftCountsBefore": {"D": 0, "E": 0, "N": 0},
        "balanceShiftTypes": True,
        "requestMissBefore": 0,
    }


def request(seed: int = 1, y: int = 2026, m: int = 11, time_limit: float = 3.0) -> dict:
    days = month_days(y, m)
    red = red_days(days)
    target = len(red)
    return copy.deepcopy(
        {
            "contractVersion": 1,
            "seed": seed,
            "timeLimitSec": time_limit,
            "days": days,
            "redDays": red,
            "prevTail": [],
            "nurses": [nurse(f"n{i}", days, target) for i in range(1, 11)],
            "heads": [
                {
                    "id": "h",
                    "kTass": True,
                    "junior": False,
                    # 2-11 R-HEAD-1: 평일 기본 S(flex), 빨간 날 OFF
                    "cells": [
                        {"date": d, "code": "OFF"} if d in red else {"date": d, "code": "S", "flex": True}
                        for d in days
                    ],
                }
            ],
            "trainings": [],
            "rules": {
                "minStaff": 2,
                "minKTass": 1,
                "minRestHours": 16,
                "maxConsecutiveNight": 3,
                "maxConsecutiveOff": 15,
                "maxConsecutiveWork": 5,
                "offAfterNight": 2,
                "sleepingOffPerN": 6,
                "forbiddenPatterns": ["E-D", "N-E", "N-OFF-D", "E-S"],
                "shiftBalanceTolerance": 2,
                "shiftBalanceWindowMonths": 3,
            },
            "restHours": rest_hours(),
            "priorities": {
                "requests": True,
                "offAfterNight": True,
                "weekendPair": True,
                "avoidJuniorOnly": True,
                "minimizeRepeatPairs": True,
            },
        }
    )

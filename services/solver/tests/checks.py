"""pytest용 간이 하드 규칙 검사 (정식 교차 검증은 web의 TS 검사기가 한다)."""

from __future__ import annotations

REST = {"OFF", "AL", "LEAVE"}


def grid(req: dict, res: dict) -> dict:
    g = {(c["userId"], c["date"]): c for c in req["prevTail"] + req.get("nextHead", [])}
    g.update({(c["userId"], c["date"]): c for c in res["cells"]})
    return g


def timeline(req: dict) -> list[str]:
    head = sorted({c["date"] for c in req.get("nextHead", [])})
    return sorted({c["date"] for c in req["prevTail"]}) + req["days"] + head


def hard_violations(req: dict, res: dict) -> list[str]:
    g = grid(req, res)
    tl = timeline(req)
    r = req["rules"]
    out: list[str] = []
    heads = {(h["id"], c["date"]): c["code"] for h in req["heads"] for c in h["cells"]}
    trainees = {t["traineeId"]: t for t in req["trainings"]}
    for d in req["days"]:
        for s in "DEN":
            members = [
                n
                for n in req["nurses"]
                if g.get((n["id"], d), {}).get("code") == s
                and not (
                    n["id"] in trainees
                    and trainees[n["id"]]["startDate"] <= d <= trainees[n["id"]]["tripleUntil"]
                )
            ]
            h = [hd for hd in req["heads"] if heads.get((hd["id"], d)) == s]
            if len(members) + len(h) < r["minStaff"]:
                out.append(f"STAFF {d} {s}")
            kt = [
                n
                for n in members
                if n["kTass"]
                and not (
                    n["id"] in trainees
                    and trainees[n["id"]]["startDate"] <= d <= trainees[n["id"]]["endDate"]
                )
            ]
            if len(kt) + sum(1 for hd in h if hd["kTass"]) < r["minKTass"]:
                out.append(f"KTASS {d} {s}")
    for n in req["nurses"]:
        nid = n["id"]
        codes = [g.get((nid, d), {}).get("code") for d in tl]
        tokens = [None if c is None else ("OFF" if c in REST else c) for c in codes]
        month_start = tl.index(req["days"][0])
        month_end = tl.index(req["days"][-1])
        for p in r["forbiddenPatterns"]:
            parts = p.split("-")
            for i in range(len(tokens) - len(parts) + 1):
                touches = i + len(parts) - 1 >= month_start and i <= month_end
                if touches and tokens[i : i + len(parts)] == parts:
                    out.append(f"PATTERN {nid} {p} {tl[i]}")
        nights = sum(1 for d in req["days"] if g.get((nid, d), {}).get("code") == "N")
        if nights > n["nightMax"]:
            out.append(f"NIGHT_MAX {nid}")
        run = 0
        for i, c in enumerate(codes):
            run = run + 1 if c == "N" else 0
            if run > r["maxConsecutiveNight"] and month_start <= i and i - run + 1 <= month_end:
                out.append(f"NIGHT_CONSEC {nid} {tl[i]}")
        run = 0
        for i, c in enumerate(codes):
            run = run + (0 if c == "LEAVE" else 1) if c in REST else 0
            if run > r["maxConsecutiveOff"] and month_start <= i and i - run + 1 <= month_end:
                out.append(f"OFF_CONSEC {nid} {tl[i]}")
        sleeping = sum(1 for d in req["days"] if g.get((nid, d), {}).get("offKind") == "sleeping")
        if sleeping * r["sleepingOffPerN"] > max(0, n["nightBankBefore"] + nights):
            out.append(f"SLEEPING {nid}")
        for f in n["fixed"]:
            c = g.get((nid, f["date"]))
            if not c or c["code"] != f["code"]:
                out.append(f"FIXED {nid} {f['date']}")
    for t in req["trainings"]:
        for d in req["days"]:
            if not (t["startDate"] <= d <= t["endDate"]):
                continue
            a, b = g.get((t["traineeId"], d)), g.get((t["preceptorId"], d))
            if not a or not b or {a["code"], b["code"]} & {"AL", "LEAVE"}:
                continue
            if not ((a["code"] in REST and b["code"] in REST) or a["code"] == b["code"]):
                out.append(f"TRAINING {d}")
    return out

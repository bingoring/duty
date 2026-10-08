"""병동 종이 근무표 엑셀(월별 시트) → 운영 DB 가져오기용 JSON (Build Spec 3-1 「이력 가져오기」).

  uv run --with openpyxl python deploy/history/excel_to_bundle.py <근무표.xlsx> <원문 명단.md> <출력.json> [마지막 달 확정본.json]

입력·출력에는 실명이 들어 있으므로 .local/ 안에서만 다룬다(이 스크립트에는 실명이 없다).
시트 형식: 3행 = 날짜 머리(1..31 + 누적off·ⓡN·특휴개원·검진·보), 5행부터 [사번, 성명, 이월off, 이월N, 1일.., 누적off, ⓡN, 특휴개원, 검진, 보],
표 아래 「*이름 : 메모」. 빨간 글씨 칸 = 신청 반영.
"""
import datetime
import json
import re
import sys

import openpyxl

YEAR = 2026
# 칸 표기 → (코드, offKind, leaveKind, 검진 반차)
CODES = {
    "D": ("D", None, None, False),
    "E": ("E", None, None, False),
    "N": ("N", None, None, False),
    "S": ("S", None, None, False),
    "OFF": ("OFF", "regular", None, False),
    "특휴": ("OFF", "special", None, False),
    "개원": ("OFF", "founding", None, False),
    "보수": ("OFF", "edu_cont", None, False),
    "공가": ("LEAVE", None, "official", False),
    "병가": ("LEAVE", None, "sick", False),
    "청원": ("LEAVE", None, "family", False),
    # 근무일 안의 짧은 휴가·검진: 근무(D)로 두고 보고서에 남긴다
    "반반": ("D", None, None, False),
    "오후반휴": ("D", None, None, False),
    "검진": ("D", None, None, True),
}
RED = ("FF0000", "C00000", "E00000")
TIER = {"고연차": "senior", "중간연차": "mid", "저연차": "junior"}

# 두벌식 자판: 한글 이름을 영문 자판으로 친 값(초기 비밀번호, DECISIONS 2026-10-09)
CHO = "r R s e E f a q Q t T d w W c z x v g".split()
JUNG = "k o i O j p u P h hk ho hl y n nj np nl b m ml l".split()
JONG = [""] + "r R rt s sw sg e f fr fa fq ft fx fv fg a q qt t T d w c z x v g".split()


def qwerty(name: str) -> str:
    out = []
    for ch in name:
        c = ord(ch) - 0xAC00
        if not 0 <= c < 11172:
            out.append(ch)
            continue
        out.append(CHO[c // 588] + JUNG[(c % 588) // 28] + JONG[c % 28])
    return "".join(out)


def num(v):
    if v is None or v == "" or v == "-":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None  # 「11/3 입사」 같은 메모
    return f if not f.is_integer() else int(f)


def pair(v):
    """특휴/개원 칸: '5/1' 문자열 또는 엑셀이 날짜로 읽은 값(월=특휴, 일=개원). '-'는 없음"""
    if isinstance(v, datetime.datetime):
        return v.month, v.day
    if isinstance(v, str) and "/" in v:
        a, b = v.split("/")
        return num(a.strip()), num(b.strip())
    return None, None


def is_red(cell) -> bool:
    c = cell.font.color if cell.font else None
    return bool(c is not None and c.type == "rgb" and isinstance(c.rgb, str) and c.rgb.upper().endswith(RED))


def roster(path):
    text = open(path, encoding="utf-8").read().split("# 응급실 근무자")[1]
    out = {}
    for line in text.splitlines():
        m = re.match(r"^(\d{5}) (\S+) (.*)$", line)
        if not m:
            continue
        rest = m.group(3)
        head = "수선생님" in rest
        tier = next((v for k, v in TIER.items() if k in rest), "senior" if head else "junior")
        out[m.group(1)] = {
            "head": head,
            "tier": tier,
            "kTass": head or "K-tass 있음" in rest,
            "union": head or "노조" in rest,
        }
    return out


def main(xlsx, roster_md, out_path, final_path=None):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    attrs = roster(roster_md)
    people = {}  # 이름 → 정보 (사번은 비어 있는 달이 있어 이름으로 모은다)
    months = []
    report = []
    for ws in wb.worksheets:
        month = int(re.match(r"(\d+)월", ws.title).group(1))
        rows = list(ws.iter_rows())
        hdr = [c.value for c in rows[2]]
        days = [i for i, v in enumerate(hdr) if isinstance(v, (int, float)) and 1 <= v <= 31]
        col = {v: i for i, v in enumerate(hdr) if isinstance(v, str)}
        mrows = []
        for order, r in enumerate([r for r in rows[4:] if isinstance(r[1].value, str) and r[1].value.strip()]):
            name = r[1].value.strip()
            p = people.setdefault(name, {"name": name, "no": None, "months": [], "order": {}})
            if r[0].value is not None:
                p["no"] = str(int(r[0].value)).zfill(5)
            p["months"].append(month)
            p["order"][month] = order
            # 이월 칸에 적힌 입사 메모(예: 1월 시트의 「11/3 입사」 = 작년)
            for v in (r[2].value, r[3].value):
                m = re.search(r"(\d+)/(\d+)\s*입사", str(v or ""))
                if m:
                    y = YEAR - 1 if int(m.group(1)) > month else YEAR
                    p.setdefault("hire", f"{y}-{int(m.group(1)):02d}-{int(m.group(2)):02d}")
            cells = []
            for k, i in enumerate(days):
                v = "" if r[i].value is None else str(r[i].value).strip()
                date = f"{YEAR}-{month:02d}-{int(hdr[i]):02d}"
                if v in ("", None):
                    continue
                if v not in CODES:
                    m = re.search(r"(\d+)/(\d+)\s*입사", v)
                    if m:
                        p["hire"] = f"{YEAR}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
                    report.append(f"{month}월 칸 메모(칸 없음으로): {v}")
                    continue
                code, off, leave, half = CODES[v]
                if v in ("반반", "오후반휴", "검진"):
                    report.append(f"{month}월 {date} 「{v}」 → 근무(D){' + 검진 반차' if half else ''}")
                cell = {"date": date, "code": code, "source": "requested" if is_red(r[i]) else "auto"}
                if off:
                    cell["offKind"] = off
                if leave:
                    cell["leaveKind"] = leave
                if half:
                    cell["checkupHalf"] = True
                cells.append(cell)
            special, founding = pair(r[col["특휴개원"]].value)
            mrows.append(
                {
                    "name": name,
                    "offCarryBefore": num(r[2].value) or 0,
                    "nightBankBefore": num(r[3].value) or 0,
                    "offCarryAfter": num(r[col["누적off"]].value) or 0,
                    # 진행 중인 달은 ⓡN이 비어 있다 → None(가져오기가 종이 관례로 슬리핑오프를 계산)
                    "nightBankAfter": num(r[col["ⓡN"]].value),
                    "specialAfter": special,
                    "foundingAfter": founding,
                    "checkupAfter": num(r[col["검진"]].value),
                    "eduContAfter": num(r[col["보"]].value),
                    "cells": cells,
                }
            )
        # 표 아래 메모: 노조교육 → edu_union, 검진 반차 → checkupHalf, 입사·발령·퇴사·이동 → 재직 기간
        notes = []
        for r in rows:
            for c in r:
                if isinstance(c.value, str) and c.value.strip().startswith("*"):
                    notes += [s.strip() for s in c.value.split("*") if s.strip()]
        for note in notes:
            who = next((n for n in people if note.startswith(n)), None)
            body = note[len(who):] if who else note
            row = next((x for x in mrows if x["name"] == who), None)
            handled = False
            dates = list(re.finditer(r"(\d+)/(\d+)(?:~(\d+)/(\d+))?", body))
            for k, m in enumerate(dates):
                # 날짜 다음부터 다음 날짜 앞까지가 그 날짜의 내용(「부서이동(61W-->ER)」처럼 숫자가 섞여도)
                what = body[m.end() : dates[k + 1].start() if k + 1 < len(dates) else len(body)]
                date = f"{YEAR}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
                cell = next((c for c in row["cells"] if c["date"] == date), None) if row else None
                if "노조" in what and cell and cell["code"] == "OFF":
                    cell["offKind"] = "edu_union"
                    handled = True
                elif "검진" in what and cell and cell["code"] in ("D", "E", "N", "S"):
                    cell["checkupHalf"] = True
                    handled = True
                elif who and ("입사" in what or "발령" in what or "-->ER" in what):
                    people[who]["hire"] = date
                    handled = True
                elif "병가" in what and row and m.group(3):
                    # 「3/10~4/19 유급병가」: 이 달 안의 빈 날을 병가 칸으로
                    a = datetime.date(YEAR, int(m.group(1)), int(m.group(2)))
                    z = datetime.date(YEAR, int(m.group(3)), int(m.group(4)))
                    have = {c["date"] for c in row["cells"]}
                    d = a
                    while d <= z:
                        iso = d.isoformat()
                        if d.month == month and iso not in have:
                            row["cells"].append({"date": iso, "code": "LEAVE", "leaveKind": "sick", "source": "auto"})
                        d += datetime.timedelta(days=1)
                    row["cells"].sort(key=lambda c: c["date"])
                    handled = True
                elif who and "퇴사" in what:
                    people[who]["leftOn"] = (datetime.date.fromisoformat(date) + datetime.timedelta(days=1)).isoformat()
                    handled = True
                elif who and "ER-->" in what:
                    people[who]["leftOn"] = date
                    handled = True
            if not handled:
                report.append(f"{month}월 메모(반영 안 함): {note}")
        months.append({"month": month, "rows": mrows})

    last = max(m["month"] for m in months)
    current = [p for p in people.values() if last in p["months"]]
    current.sort(key=lambda p: p["order"][last])
    departed = [p for p in people.values() if last not in p["months"]]
    out_people = []
    for rank, p in enumerate(current + departed, start=1):
        if p["no"] is None:
            p["no"] = f"H{YEAR % 100}{sum(1 for q in people.values() if q['no'] and q['no'].startswith('H')) + 1:02d}"
            report.append(f"사번 없음 → 임시 사번 {p['no']}(비활성 이력 전용)")
        a = attrs.get(p["no"])
        if a is None:
            report.append(f"원문 명단에 없음(기본값: 저연차·K-tass 없음·노조 아님): {p['no']}")
            a = {"head": False, "tier": "junior", "kTass": False, "union": False}
        left = p.get("leftOn")
        if p in departed and not left:
            left = f"{YEAR}-{max(p['months']) + 1:02d}-01"
            report.append(f"{p['no']}: {max(p['months'])}월 뒤 명단에서 빠짐 → 비활성(재직 끝 {left} 전날)")
        out_people.append(
            {
                "employeeNo": p["no"],
                "name": p["name"],
                "role": "admin" if a["head"] else "nurse",
                "rotation": "fixed_weekday" if a["head"] else "rotating",
                "seniorityRank": rank,
                "seniorityTier": a["tier"],
                "hireDate": p.get("hire"),
                "kTass": a["kTass"],
                "unionMember": a["union"],
                "deactivatedOn": None if p in current else left,
                "initialPassword": qwerty(p["name"]),
            }
        )
    for i, p in enumerate([p for p in people.values() if p["no"] is None], start=1):
        p["no"] = f"H{YEAR % 100}{i:02d}"  # 엑셀에 사번이 없는 과거 근무자(비활성, 로그인 안 함)
        report.append(f"사번 없음 → 임시 사번 {p['no']}(비활성 이력 전용)")
    # 엑셀의 마지막 달이 초안이면, 사진을 옮긴 확정본(fixtures/paper-YYYY-MM.json, 가명·같은 행 순서)으로 칸을 바꾼다.
    # 행 순서가 같은지는 이월 off·이월 N이 모두 같은지로 확인한다
    if final_path:
        fx = json.load(open(final_path, encoding="utf-8"))
        target = next(m for m in months if m["month"] == fx["month"])
        if len(fx["nurses"]) != len(target["rows"]) or any(
            (f["offCarryBefore"], f["nightBankBefore"]) != (r["offCarryBefore"], r["nightBankBefore"])
            for f, r in zip(fx["nurses"], target["rows"])
        ):
            raise SystemExit("확정본과 엑셀의 행 순서·이월 값이 맞지 않습니다")
        tok = {"D": ("D", None), "E": ("E", None), "N": ("N", None), "S": ("S", None), "O": ("OFF", "regular")}
        for f, r in zip(fx["nurses"], target["rows"]):
            cells = []
            for i, t in enumerate(f["row"].split()):
                if t == "-":
                    continue
                code, off = tok[t]
                c = {"date": f"{YEAR}-{fx['month']:02d}-{i + 1:02d}", "code": code, "source": "auto"}
                if off:
                    c["offKind"] = off
                cells.append(c)
            r["cells"] = cells
        report.append(f"{fx['month']}월 칸은 확정본({final_path})에서(신청 반영 표시는 없음)")
    no = {p["name"]: p["no"] for p in people.values()}
    for m in months:
        for r in m["rows"]:
            r["employeeNo"] = no[r.pop("name")]
    bundle = {"year": YEAR, "people": out_people, "months": months, "report": report}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=1)
    print(f"사람 {len(out_people)}명(현재 {len(current)}), 달 {len(months)}개, 칸 {sum(len(r['cells']) for m in months for r in m['rows'])}개, 보고 {len(report)}건")


if __name__ == "__main__":
    main(*sys.argv[1:5])

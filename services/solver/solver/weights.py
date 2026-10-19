# Build Spec 2-6 business-rules §4. 앞 단계를 희생하지 않도록 단계 사이를 넉넉히 벌린다.
# 공정성(OFF 부족분)은 0.5 단위를 정수로 다루려고 ×2 한 값에 곱한다.
WEIGHTS: dict[str, int] = {
    "offShortMax": 10000,
    "offShort": 2000,
    "offOver": 500,
    "requestMissMax": 1500,
    "requestMiss": 300,
    # 2-11 R-HEAD-3: 수간호사 기본 S 칸을 D로 바꾸는 것은 필수 인원을 달리 채울 수 없을 때만
    "headFill": 20000,
    "weekendPair": 400,
    "weekendCarry": 400,
    "workConsec": 300,
    "nightTarget": 200,
    # 3-5 추가: 월 나이트 최소에 모자란 N 하나당
    "nightMin": 200,
    # 3-8: N 재시작(권고 기본), 신청 OFF 전날 N(필수 기본 — 권고로 낮췄을 때)
    "nightRestart": 150,
    "offEve": 2000,
    "offAfterNight": 150,
    "sleepingShort": 120,
    "shiftBalance": 60,
    "reverseRotation": 100,
    "juniorOnly": 40,
    "repeatPair": 10,
    "tieBreak": 1,
    # 3-5: 필수 규칙을 권고로 낮췄을 때의 벌점. 원래 권고 항보다 크게, 인원 부족은 수간호사 보충보다 크게 둔다
    "staffShort": 30000,
    "ktasShort": 30000,
    "training": 5000,
    "rest": 5000,
    "pattern": 5000,
    "nightMax": 3000,
    "nightConsec": 3000,
    "offConsec": 2000,
    "sleepingOver": 3000,
    # 3-9: 최대 인원(기본 권고, DECISIONS 2026-10-19)은 신청 반영(requestMiss 300)보다 낮게 —
    # 3명 듀티를 피하려고 간호사 신청을 버리지 않는다. 누적 OFF 범위를 권고로 낮췄을 때는 0.5 단위 ×2 한 값에
    "staffOver": 250,
    "offCarry": 3000,
}

# 검사기 REPEAT_PAIR_MIN과 같은 값. 권고일 때 쌍 평균은 변수라 솔버는 고정 임계 초과분만 벌한다
# (필수면 검사기와 같은 임계로 막는다)
REPEAT_PAIR_MIN = 4
# 최근 3개월 불충족 몇 건마다 이번 달 1건으로 치는가 (Q3 가산)
REQUEST_MISS_BEFORE_DIV = 3
# 검사기 SHIFT_BALANCE_MIN_WORK와 같은 값: 이번 달 D·E·N 합이 이 수 이상일 때만 이번 달 분포를 본다
SHIFT_BALANCE_MIN_WORK = 9
# 검사기 NIGHT_RESTART_MAX_GAP과 같은 값: N 뒤 이 일수 이내로 쉬고 다시 N이면 재시작
NIGHT_RESTART_MAX_GAP = 3

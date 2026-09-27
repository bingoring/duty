# Build Spec 2-6 business-rules §4. 앞 단계를 희생하지 않도록 단계 사이를 넉넉히 벌린다.
# 공정성(OFF 부족분)은 0.5 단위를 정수로 다루려고 ×2 한 값에 곱한다.
WEIGHTS: dict[str, int] = {
    "offShortMax": 10000,
    "offShort": 2000,
    "offOver": 500,
    "requestMissMax": 1500,
    "requestMiss": 300,
    "headFill": 800,
    "weekendPair": 400,
    "weekendCarry": 400,
    "nightTarget": 200,
    "offAfterNight": 150,
    "sleepingShort": 120,
    "shiftBalance": 60,
    "juniorOnly": 40,
    "repeatPair": 10,
    "tieBreak": 1,
}

# 검사기 REPEAT_PAIR_MIN과 같은 값. 쌍 평균은 변수라 솔버는 고정 임계 초과분만 벌한다
REPEAT_PAIR_MIN = 4
# 최근 3개월 불충족 몇 건마다 이번 달 1건으로 치는가 (Q3 가산)
REQUEST_MISS_BEFORE_DIV = 3

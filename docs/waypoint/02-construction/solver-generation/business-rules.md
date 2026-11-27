# business-rules — 2-6 솔버·듀티 생성

규칙 ID는 `R-GEN-*`. 검사기 규칙 ID(H-*, S-*)는 2-2 [`domain-core/business-rules.md`](../domain-core/business-rules.md)를 따른다.

## §1. 생성·확정 권한과 상태

| ID | 규칙 |
|---|---|
| R-GEN-1 | 생성·리롤·확정은 관리자만 한다. 액션의 첫 await는 `adminOnly()`(정적 가드 테스트). |
| R-GEN-2 | 생성 가능 상태는 REQUEST_CLOSED·DRAFTING. REQUESTING이면 `today > requestDeadline`일 때 `ensureRequestPlan`이 먼저 REQUEST_CLOSED로 바꾼다. 그 전이면 거부하고 "M/D 신청 마감 뒤 생성할 수 있습니다"(Q1). 계획이 없는 달, CONFIRMED·CLOSED 달도 거부. |
| R-GEN-3 | 첫 생성이 성공하면 REQUEST_CLOSED → DRAFTING(`nextPlanStatus('GENERATE')`). 실패(불가능·시간 초과·연결 실패)는 상태를 바꾸지 않는다. |
| R-GEN-4 | 확정은 DRAFTING에서, 그 달의 후보 중 하나로만. 후보의 `checkResult.hardViolations`가 비어 있어야 한다(저장 시점에 보장, 확정 때 다시 검사). |
| R-GEN-5 | 확정 전 입력 해시(§3)를 다시 계산해 후보의 `inputHash`와 다르면 거부: "신청·휴가·규칙이 바뀌었습니다. 다시 생성해 주세요." |
| R-GEN-6 | 확정하면 `schedule_cells`에 후보 칸을 그대로 복사하고 CONFIRMED로 바꾼다(한 트랜잭션). 같은 달에 이미 칸이 있으면 거부(버그). 후보들은 지우지 않고 남긴다. |
| R-GEN-7 | 동시 생성 방지: 같은 달 생성은 `month_plans` 행 잠금(`SELECT … FOR UPDATE`) 안에서 `generationNo = max + 1`. |
| R-GEN-8 | DRAFTING 달의 후보·칸은 간호사 DTO에 절대 나가지 않는다(S3는 확정본만, S4 잠금 상태). |

## §2. 솔버 모델 — 하드 제약 (검사기와 1:1)

솔버의 하드 제약은 TS 검사기 하드 규칙과 **같은 판정**이어야 한다. 불일치는 교차 검증(§5)이 잡는다.

| 검사기 | 솔버 제약 |
|---|---|
| H-CELL | 교대 근무자 재직일마다 코드 정확히 1개(D·E·N·OFF, 고정 칸이면 그 코드). 재직일이 아니면 칸 없음 |
| H-STAFF | 날짜·듀티(D·E·N)마다 `교대 근무자 수(3인 근무 신규 제외) + 수간호사 보충 ≥ minStaff` |
| H-KTASS | 같은 식으로 K-tass(트레이닝 중 신규 제외) + 수간호사 K-tass ≥ minKTass |
| 3인 근무 (R-STAFF-5·6) | 신규는 `tripleUntil`까지, 그 뒤 트레이닝 안에서 처음 서는 N `tripleNightsLeft`개는 인원에 세지 않는다. "처음 서는 N"은 순서 의존이라 날짜순 누적 N 수 변수 `cumN[t,d]`로 표현: 신규가 d에 N이고 `cumN < tripleNightsLeft`이면 비계수 |
| H-TRAINING | 트레이닝 기간 날마다 신규·프리셉터가 같은 근무 코드이거나 둘 다 쉼. 한 명이라도 AL·LEAVE 고정이면 제외 |
| H-PATTERN | 금지 패턴마다 전월 꼬리 + 대상 월 타임라인에서 창 위치별로 `sum(일치 리터럴) ≤ 길이 − 1`. 쉬는 칸(OFF·AL·LEAVE)은 토큰 OFF |
| H-REST | 이어지는 두 날의 서로 다른 근무 코드 쌍 중 `restHours[a][b] < minRestHours`인 쌍 금지(전월 꼬리 포함) |
| H-NIGHT-MAX | 월 N 수 ≤ `nightMax` |
| H-NIGHT-CONSEC | 창 길이 `maxConsecutiveNight + 1`마다 N 합 ≤ maxConsecutiveNight(전월 꼬리 포함) |
| H-OFF-CONSEC | 연속 쉬는 구간의 가중 길이(LEAVE는 0, 끊지 않음) ≤ maxConsecutiveOff. 누적 변수 `run[d] = rest[d] × (run[d−1] + w[d])`를 선형화해 표현 |
| H-SLEEPING | `6 × sleeping ≤ nightBankBefore + N` (6 = sleepingOffPerN) |
| H-SPECIAL-REQ·H-EDU-*·H-BALANCE | 고정 칸으로 이미 만족(솔버는 바꾸지 않음). 입력 조립에서 한도를 넘는 고정 칸이 있으면 생성 전에 거부(R-GEN-11) |

## §3. 입력 해시

`SolverRequest`에서 `seed`·`timeLimitSec`·`priorities`를 뺀 값을 키 정렬 JSON으로 만들어 sha256. 신청·휴가 승인·규칙 버전·잔여·트레이닝·공휴일·전월 확정본이 바뀌면 해시가 바뀐다.

## §4. 소프트 목적 (가중 합 최소화)

우선순위 순서는 원문 §15 "공평 1순위" → 신청(Q3) → 운영 권고. 가중치는 솔버 상수(`weights.py`)이며 단계 사이 차이를 10배 이상 두어 앞 단계를 희생하지 않게 한다.

| 항 | 정의 | 가중치 | 끔(Q4) |
|---|---|---|---|
| offShortMax | max_n(목표 OFF − 실제 OFF, 0) (0.5 단위 → ×2) | 10000 | — |
| offShort | Σ 부족분 | 2000 | — |
| offOver | Σ max(실제 − 목표, 0) | 500 | — |
| requestMissMax | max_n(이번 달 불충족 수 + ⌊requestMissBefore/3⌋) | 1500 | 근무 신청 |
| requestMiss | Σ 불충족(옵션 중 하나도 아닌 칸) | 300 | 근무 신청 |
| headFill | 교대 근무자만으로 minStaff·minKTass를 못 채운 듀티 수(S-HEAD-FILL) | 800 | — |
| weekendPair | 주말 통 OFF(토·일 둘 다 쉼, 토요일이 속한 달)를 못 받은 사람 × (1 + weekendMissedStreak) | 400 | 주말 통 OFF |
| weekendCarry | weekendCarryIn인데 1일(일)이 근무 | 400 | 주말 통 OFF |
| nightTarget | Σ max(N − nightTarget, 0) | 200 | — |
| offAfterNight | N 구간 뒤 쉬는 칸이 1~(offAfterNight−1)개이고 다음이 근무(S-OFF-AFTER-N) | 150 | N 후 OFF 2개 |
| sleepingShort | Σ(한도 − 슬리핑 수) | 120 | — |
| shiftBalance | 월 D·E·N 차이의 허용치 초과분 + 누적 창 초과분(대상자만) | 60 | — |
| juniorOnly | 모두 저연차인 듀티 수 | 40 | 저연차만 방지 |
| repeatPair | 같은 날 같은 듀티 쌍 횟수의 max(4, …) 초과분 합(트레이닝 쌍 제외) | 10 | 반복 겹침 |
| tieBreak | 시드로 뽑은 칸별 0~3 계수 × 배정 | 1 | — |

- 프리셉터–신규 동일 근무는 필수(H-TRAINING)라 끌 수 없다. 체크박스는 켠 채 비활성.
- 끈 항은 목적에서 뺄 뿐, TS 재검사는 규칙 설정 토글 기준으로 경고를 그대로 낸다(Q4).
- 반복 겹침 임계값의 "쌍 평균"은 변수라 솔버는 고정 임계 4(REPEAT_PAIR_MIN) 초과분을 벌점으로 쓴다. 검사기 경고와 다를 수 있다(권고라 무방).

## §5. 교차 검증 시나리오 (`fixtures/generation/*.json`, CI)

| 시나리오 | 내용 | 기대 |
|---|---|---|
| nov-2026 | 가명 시드 + 11월 신청 20여 건·휴가 2건, 전월 = 종이 10월 확정본 | FEASIBLE/OPTIMAL, 하드 위반 0, 10/31 N 뒤 11월 초 N ≤ 2 |
| trainee | 신규 1명 3인 근무 3주 + 프리셉터 | 하드 위반 0, 3인 기간 신규는 인원에 불포함 |
| holidays | 연휴(추석형 빨간 날 5일) 달 | 하드 위반 0, 기준 OFF 증가 반영 |
| short | 3명 장기 휴가로 여유 음수 | INFEASIBLE + 원인(STAFF 날짜) 또는 FEASIBLE이면 offShort > 0으로 음수 이월 |
| paper-oct | 종이 10월 신청(고정 칸만) 재생성 | 하드 위반 0 |

## §6. 입력·오류

| ID | 규칙 |
|---|---|
| R-GEN-9 | 솔버 연결 실패·5xx·시간 초과(요청 타임아웃 = timeLimitSec + 10초) → "솔버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요." 후보 없음. |
| R-GEN-10 | 솔버 결과를 TS 검사기로 재검사해 하드 위반이 1개라도 있으면 후보를 저장하지 않고 서버 로그에 `solver_hard_violation`(규칙 ID·날짜·시드)을 남긴다. 사용자에게는 "생성 결과가 규칙 검사를 통과하지 못했습니다. 다른 시드로 다시 시도해 주세요."(1-3 §3 "사용자에게 노출되지 않음"을 따르되 빈 화면 대신 재시도 안내) |
| R-GEN-11 | 고정 칸만으로 하드 규칙을 어기면(예: 승인 휴가가 잔여 초과, 교육 한도 초과) 솔버를 부르지 않고 검사기 문구로 원인을 보여 준다. |
| R-GEN-12 | 불가능 원인 문구: STAFF "11/7 N 인원 부족 — 가용 인원 1명", KTASS "11/7 N K-tass 가능 인원 없음", NIGHT_MAX "홍다은 N 상한 7개로는 부족", OFF_CONSEC·FIXED "정하늘 11/19–25 휴가와 겹침" 등. 최대 5개, 날짜순. |
| R-GEN-13 | 전월 계획이 CONFIRMED·CLOSED가 아니면 prevTail = [] 로 생성하고 결과 상단에 "10월 근무표가 확정되지 않아 월 경계 규칙(연속 N·금지 패턴)을 확인하지 못했습니다" 경고. |

---
artifact: business-rules
build-spec: domain-core
status: IMPLEMENTED
updated: 2026-09-27
---

# Business Rules — 2-2 Domain Core

> 수치는 모두 `RuleSet.params`에서 읽는다(표의 괄호 값은 기본값). **하드** = 생성기가 반드시 지키고 S9에서 적용을 막는다.
> **소프트** = 생성기가 최대한 줄이고 S8·S9에서 경고만 한다(핸드오프 S8 "필수/권고", S7 "자동 적용/권고").
> 질문 표시(Q1~Q4)가 붙은 규칙은 2026-09-27 답변으로 확정했다(DECISIONS).

## 1. 규칙 표

### 1.1 검사 범위

| ID | 규칙 | 위반 시 | 근거 |
|---|---|---|---|
| R-SCOPE-1 | `rotation = fixed_weekday`인 사람(수간호사)은 사람 단위 검사에서 모두 제외한다. 인원 집계에는 **최후의 수단**으로만 넣는다(R-STAFF-4) **(Q1)** | — | 1-1 Q3, 2026-09-27 답변 |
| R-SCOPE-2 | 재직일 = `employedFrom ≤ d ≤ employedUntil`(null은 무제한). 재직일이 아닌 날의 칸은 검사하지 않고, 인원에도 세지 않는다 | — | 1-2 §4 |
| R-SCOPE-3 | 위반은 **대상 월 날짜를 하나 이상 포함할 때만** 보고한다. 전월 꼬리만으로 이뤄진 위반은 전월의 몫이다 | — | 월 경계 |
| R-SCOPE-4 | 전월 꼬리 길이 `requiredTailDays = max(maxConsecutiveOff, maxConsecutiveNight, 가장 긴 금지 패턴 길이 − 1, offAfterNight + 1)` (기본값 기준 15) | — | 1-2 §9 |

### 1.2 하드 규칙

| ID | 규칙 | 단위 | 근거 |
|---|---|---|---|
| H-CELL | 교대 근무자의 재직일에는 칸이 정확히 1개 있어야 한다(누락 = 위반). 재직일이 아닌 날에 칸이 있어도 위반 | 사람·날짜 | 1-2 §6-2 |
| H-PATTERN | 금지 패턴(`E-D`, `N-E`, `N-OFF-D`, `E-S`)과 연속 칸의 토큰 열이 일치하면 위반. 토큰: 근무 칸은 코드, **쉬는 칸(OFF·AL·LEAVE)은 `OFF`** **(Q3)**, 칸 없음은 어떤 토큰과도 불일치 | 사람·시작일 | 원문 §5 |
| H-REST | 인접한 두 날의 칸이 **서로 다른** 근무 코드일 때, 앞 근무 종료 ~ 뒤 근무 시작 < `minRestHours`(16)이면 위반. 같은 코드 연속(D-D, N-N)은 대상이 아니다 | 사람·두 날짜 | 원문 §4, 종이 검증(아래 §6) |
| H-NIGHT-MAX | 한 달 N 수 > 상한. 상한 = `maxNightPerMonth`(7). 단 `toggles.nightDedicated`이고 그 사람의 야간 전담 기간이 대상 월과 겹치면 `nightDedicatedMaxPerMonth`(15), 31일 달은 `…31`(16) | 사람·월 | 야간 지침 §1 |
| H-NIGHT-CONSEC | 연속 N > `maxConsecutiveNight`(3) | 사람·연속 구간 | 야간 지침 §2 |
| H-OFF-CONSEC | 연속으로 쉬는 날 > `maxConsecutiveOff`(**15**, 관리자 설정). OFF·AL은 1일로 세고, **LEAVE는 세지 않되 연속을 끊지도 않는다** **(Q2)** | 사람·연속 구간 | 핸드오프 S7 규칙 8 |
| H-STAFF | 날짜 d, 듀티 s ∈ {D,E,N}의 (집계 인원 + 수간호사 보충 인원) < `minStaffPerShift`(2). R-STAFF-1·4. 3인 근무 신규는 세지 않으므로 그 듀티는 신규 + 프리셉터(H-TRAINING) + 그 외 1명 = 3명이 된다 | 날짜·듀티 | 응급실 지침 §2 |
| H-KTASS | (집계 K-tass + 수간호사 보충 K-tass) < `minKTass`(1). 트레이닝 중인 신규는 K-tass로 세지 않는다 | 날짜·듀티 | 응급실 지침 §1 |
| H-TRAINING | 트레이닝 기간의 날짜마다 신규와 프리셉터의 칸이 "같은 근무"여야 한다: 둘 다 쉬는 칸이거나, 같은 근무 코드. 둘 중 한 명이라도 AL·LEAVE인 날은 예외 **(Q4)** | 신규·날짜 | 응급실 지침 §6 |
| H-SPECIAL-REQ | `special` 신청(AL → AL, EDU_CONT → OFF edu_cont, EDU_UNION → OFF edu_union)과 칸이 다르면 위반 | 사람·날짜 | 1-3 §3 "고정 셀" |
| H-SLEEPING | 그달 슬리핑오프 칸 수 > `floor((nightBankBefore + 그달 N 수) / sleepingOffPerN)` | 사람·월 | 1-2 §4 |
| H-EDU-UNION | OFF edu_union 칸이 주말·빨간 날이거나, 그 사람이 `unionMember`가 아니면 위반 | 사람·날짜 | 응급실 지침 §9, 1-2 §6-3 |

### 1.3 소프트 규칙

| ID | 규칙 | 토글 | 근거 |
|---|---|---|---|
| S-NIGHT-TARGET | 한 달 N 수 > `targetNightPerMonth`(6)이면서 하드 상한 이하 | — | 야간 지침 §1 "6일 이상이 되지 않도록" |
| S-OFF-AFTER-N | N 연속 구간이 끝난 뒤 다음 근무 전까지 쉬는 날 < `offAfterNight`(2). 전월 꼬리에서 끝난 N 구간도 본다. 다음 칸이 대상 월 밖(월말)이면 판단하지 않는다 | — | 응급실 지침 §14 |
| S-WEEKEND-PAIR | 토·일이 **둘 다** 쉬는 칸인 주말이 없다. 달을 걸친 주말은 **토요일이 속한 달**로 센다: 일요일(다음 달 1일) 칸이 `nextHead`에 있으면 확인하고, 없으면 토요일 OFF만으로 달성 예정으로 본다. `weekendPairMissedLastMonth`이면 `data.consecutive = true`(문구 "전달도 미배정") | `weekendPairOffMonthly` | 응급실 지침 §4 |
| S-WEEKEND-CARRY | 전달이 마지막 토요일 OFF에 기대 주말 통 OFF를 달성 예정으로 뒀는데(`weekendPairCarryIn`) 이번 달 1일(일)이 근무 | `weekendPairOffMonthly` | 2026-09-27 답변 |
| S-SHIFT-BALANCE | 한 사람의 그달 D·E·N 개수에서 (최대 − 최소) > `shiftBalanceTolerance`(2). D·E·N 합이 9 미만인 달, 트레이닝 중인 신규, 야간 전담 적용 중인 사람은 제외 | `balanceShiftTypes` | 2026-09-27 요청 |
| S-HEAD-FILL | 교대 근무자만으로는 H-STAFF 또는 H-KTASS를 채우지 못하고 수간호사 보충으로 채운 날·듀티(수간호사 D는 최후의 수단) | — | 2026-09-27 답변 (Q1) |
| S-JUNIOR-ONLY | 집계 인원(수간호사 보충 포함)이 1명 이상이고 전원 `junior` | `avoidJuniorOnly` | 응급실 지침 §3 |
| S-REPEAT-PAIR | 두 사람이 같은 날 같은 듀티(D/E/N)에 함께 선 횟수 ≥ 경고 기준. 경고 기준 = `max(4, ceil(2 × 전체 쌍 평균))`. 트레이닝 기간 중 신규–프리셉터 쌍은 제외 | `minimizeRepeatPairs` | 응급실 지침 §13 |
| S-REQUEST | `options` 신청을 칸이 만족하지 못함. 만족 = 칸이 근무 코드이고 options에 있음, 또는 칸이 OFF(모든 offKind)이고 options에 `OFF`가 있음. AL·LEAVE 칸은 불충족이 아니다(승인된 휴가가 우선) | — | 1-2 §5 |

### 1.4 인원 집계

| ID | 규칙 | 근거 |
|---|---|---|
| R-STAFF-1 | 집계 인원 = 그날 코드가 s인 사람 중 교대 근무자이고 재직일이며, **3인 근무 중인 신규가 아닌** 사람. 3인 근무 = ① 3인 배정 기간(`startDate ≤ d ≤ tripleStaffUntil`)이거나 ② 그 칸이 **3인 나이트**(R-STAFF-5) | 1-2 §7, 2026-09-27 답변 |
| R-STAFF-5 | 3인 나이트 = 트레이닝 기간 안에서 `tripleStaffUntil` 이후 신규가 서는 N을 날짜순으로 세어, `tripleNightsBefore + 순번 ≤ tripleNightCount`(3)인 N. 떨어져 있어도 센다. 3인 배정 기간 안의 N은 세지 않는다 | 2026-09-27 답변 |
| R-STAFF-6 | `defaultTripleStaffUntil(start, kind) = start + 7 × (new_grad ? newbieTripleWeeks(3) : experiencedTripleWeeks(2)) − 1일` | 2026-09-27 답변 |
| R-STAFF-2 | K-tass 집계는 R-STAFF-1에서 트레이닝 기간(`startDate ≤ d ≤ endDate`) 신규를 한 번 더 뺀다 | 1-2 §7 |
| R-STAFF-3 | S 근무는 D/E/N 어느 인원에도 세지 않는다 | 원문 응급실 §7 |
| R-STAFF-4 | 수간호사 보충 인원 = 그날 코드가 s이고 재직일인 `fixed_weekday` 사람 수(K-tass 보유자는 보충 K-tass에도 셈). 교대 근무자만으로 모자랄 때만 의미가 있으며 S-HEAD-FILL로 표시한다 | 2026-09-27 답변 (Q1) |

### 1.5 정산·기준 OFF

| ID | 규칙 | 근거 |
|---|---|---|
| R-BASE-1 | 빨간 날 = 토·일 ∪ `kind ≠ founding_day`인 Holiday | 1-2 §2·§4 |
| R-BASE-2 | `baselineOff` = 대상 월 재직일 중 빨간 날 수 | 1-2 §4, 종이 검증(10월 = 11) |
| R-SETTLE-1 | `actualOff` = OFF 칸 중 offKind ∈ {regular, edu_cont, edu_union} 수 | 1-2 §4 D2 |
| R-SETTLE-2 | `offCarryAfter = offCarryBefore + actualOff − baselineOff` (양수 = 더 쉼 → 반납) | 1-2 §0 D1 |
| R-SETTLE-3 | `nightBankAfter = nightBankBefore + nightCount − sleepingOffPerN × sleepingOff`. 부여하지 못한 슬리핑오프는 소멸하지 않는다 | 1-2 §4 |
| R-SETTLE-4 | fixed_weekday는 `baselineOff := actualOff`로 기록해 `off_carry` 증감이 0이다 | 1-2 §4 |
| R-SETTLE-5 | 원장 증감: `off_carry` ±, `night_bank` ±, `annual_leave −AL`, `special_leave −special`, `founding_off −founding`, `checkup −0.5×checkupHalf 칸`, `sick_leave −LEAVE sick`, `edu_cont +`, `edu_union +`. 0은 넣지 않는다 | 1-2 §4 표 |
| R-SETTLE-6 | 마감 취소 = 같은 증감의 부호를 뒤집은 항목(`reverseEntries`) | 1-2 §2 원장 근거 ② |
| R-SETTLE-7 | `weekendPairAchieved` = S-WEEKEND-PAIR와 같은 판정(토글과 무관하게 계산) | 1-2 §2 |

### 1.6 연 단위·기타

| ID | 규칙 | 근거 |
|---|---|---|
| R-SPECIAL-1 | `specialLeaveDays(d) = min(5, floor((10d + 365) / 730))` = `round_half_up(5d/365)`를 정수 연산으로 | 원문 §6-7, D3 |
| R-SPECIAL-2 | `d` = 그해 재직 일수 = [max(1/1, 입사일), min(12/31, 마지막 재직일)]의 달력 일수(없으면 0) | D3 |
| R-FOUNDING-1 | 그해 `founding_day` Holiday가 있고 그날 재직 중이면 개원오프 1, 아니면 대상 아님(`null` → 화면 "-") | 1-2 §4 |
| R-SOURCE-1 | 출처 우선순위 admin > requested > auto. requested = 칸이 신청을 만족(S-REQUEST 만족 조건 또는 special 대응). AL·LEAVE 칸은 신청이 없어도 승인 휴가로 보고 `requested` | 1-2 §5 |
| R-PLAN-1 | `defaultPlanDates(y, m)`: 전월의 `requestDeadlineDay`·`negotiationStartDay`·`negotiationEndDay`일. 전월 말일을 넘으면 말일로 맞춘다 | 1-2 §2 MonthPlan |

## 2. 검증 규칙 (입력)

| 입력 | 규칙 | 실패 |
|---|---|---|
| `ScheduleInput.cells` | (userId, date) 중복 금지, date는 대상 월, `CellSchema` 조건(offKind/leaveKind) | `DomainInputError`(throw) — 호출자 버그 |
| `prevTail` | date가 대상 월 1일 이전 `requiredTailDays` 안 | 동일 |
| `nurses` | id 중복 금지. cells의 userId는 모두 nurses에 있어야 함 | 동일 |
| `trainings` | trainee·preceptor가 nurses에 있고 `start ≤ tripleStaffUntil ≤ end` | 동일 |
| `IsoDate` | 실제 달력 날짜 | 동일 |

- 입력 오류는 위반이 아니다. 검사기는 사용자 데이터가 아니라 서버가 조립한 값을 받으므로 즉시 예외로 알린다.

## 3. 권한 / 접근 규칙

N/A — 도메인 패키지는 권한을 모른다. 코멘트는 `RequestEntry`에 없어서 도메인 결과(위반 문구 포함)에 들어갈 수 없다.

## 4. 불변식

- INV1: `checkSchedule`은 순수·결정적이다. 같은 입력이면 같은 결과이고, 결과 배열은 (ruleId, 첫 날짜, 첫 userId, shift) 순으로 정렬된다.
- INV2: 하드 위반이 0이면 생성기·S9가 저장해도 된다는 뜻이다. 소프트 경고는 저장을 막지 않는다.
- INV3: `settleMonth` 후 `nightBankAfter ≥ 0`(H-SLEEPING이 0이면 보장).
- INV4: `reverseEntries(entries)`와 `entries`의 계정별 합은 0이다.
- INV5: 입력 배열의 순서를 바꿔도 결과가 같다.

## 5. 엣지케이스

| 케이스 | 기대 동작 |
|---|---|
| 첫 달(전월 꼬리 없음) | 월 경계 규칙은 대상 월 안에서만 판단 |
| 월 중간 입사·퇴사 | 재직일만 검사·집계, 기준 OFF도 재직일만 |
| 신규의 3인 배정 기간이 월 경계에 걸침 | 날짜별로 판단 |
| 3인 나이트가 월 경계에 걸침(10월에 1개, 11월에 2개) | 11월 입력의 `tripleNightsBefore = 1` → 11월 첫 N 2개가 3인 나이트 |
| 트레이닝이 끝날 때까지 N을 3개 못 섬 | 트레이닝 기간 밖의 N은 3인 나이트가 아니다 |
| 월말이 N | S-OFF-AFTER-N 판단 안 함. 다음 달 검사가 전월 꼬리로 판단 |
| 월말 토요일(2026-10-31) | 10월 몫. 11월 칸이 없으면 10/31 OFF만으로 달성 예정, 11월 검사는 11/1이 근무면 S-WEEKEND-CARRY |
| 신청 없는 AL 칸 | 출처 `requested`, S-REQUEST 대상 아님 |
| 금지 패턴 목록이 비어 있음 | H-PATTERN 없음, `requiredTailDays`는 다른 항으로 결정 |
| 슬리핑오프를 받았는데 N 누적이 모자람 | H-SLEEPING |

## 6. 종이 근무표(2026-10, 가명)로 확인한 사실

- 금지 패턴·연속 N ≤ 3·월 N ≤ 7·연속 OFF ≤ 10을 10명 모두 지킨다.
- 16시간 휴식을 같은 코드 연속에도 적용하면 D-D(15.5h)·N-N(15h)가 모두 위반이 된다 → H-REST는 **다른 코드 사이에만** 적용한다.
- **10/2 D에 교대 근무자가 1명(윤채원)뿐**이다. 평일이라 수간호사가 D였고, 사용자 답변대로 "정말 안 되면 넣는" 최후의 수단이다 → 하드 위반이 아니라 S-HEAD-FILL.
- N-OFF-E 2회(배지현 10/9~11, 문가을 10/23~25), N 7개 2명 → 소프트 경고 4건.
- 주말 통 OFF 미배정 5명 — 새로 도입하는 권고라 종이에서는 지켜지지 않았다.
- 반복 겹침: 쌍 평균 2.04회, 최대 7회 → 경고 기준 5회.
- D→E→N 순환: 종이에 E-OFF-D(문가을 10/4~6)가 있다. 직접 역행(E-D·N-E·N-D)은 H-PATTERN·H-REST가 잡으므로 **별도 순환 검사는 두지 않는다**. 역행을 줄이는 목적은 솔버 소프트 항(2-6)으로 둔다.

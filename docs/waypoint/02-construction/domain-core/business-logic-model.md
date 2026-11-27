---
artifact: business-logic-model
build-spec: domain-core
status: IMPLEMENTED
updated: 2026-09-27
---

# Business Logic Model — 2-2 Domain Core

> 규칙의 *내용*은 business-rules, 여기는 *계산 순서와 알고리즘*이다. 모든 함수는 순수 함수이며 I/O·시계·난수를 쓰지 않는다
> (오늘 날짜가 필요한 함수는 인자로 받는다).

## 1. 워크플로 — 누가 언제 부르나

| 호출자(스테이지) | 함수 | 목적 |
|---|---|---|
| 2-3 S3 조회 | `baselineOff`, `settleMonth`(미리보기), `summarizeNurse` | 요약 카드·우측 컬럼 |
| 2-4 S10 | `specialLeaveDays`, `employedDaysInYear`, `foundingOffEligible` | 특휴·개원오프 부여 |
| 2-5 S4 | `defaultPlanDates`, `nextPlanStatus` | 마감·협의 기간, 편집 가능 여부 |
| 2-6 S8 | `checkSchedule`(솔버 결과 재검사), `resolveCellSource`, `settleMonth`(배정 요약) | 생성안 저장·확정 |
| 2-7 S9 | `checkSchedule`(브라우저 즉시 검사 + 서버 최종), `settleMonth`, `reverseEntries`, `nextPlanStatus` | 조정·마감·마감 취소 |

## 2. 알고리즘

### 2.1 날짜 (`dates.ts`)

```
parse(iso) → (y, m, d) 정수;  toUtcMs = Date.UTC(y, m-1, d)
addDays(iso, n), diffDays(a, b), dayOfWeek(iso) = new Date(toUtcMs).getUTCDay()   // 0=일
monthDates(y, m) = [y-m-01 … y-m-말일];  prevMonth(y, m)
isRedDay(iso, holidaySet) = dow ∈ {0,6} || holidaySet.has(iso)   // holidaySet은 founding_day 제외로 만든다
isEmployed(nurse, iso) = (from == null || from ≤ iso) && (until == null || iso ≤ until)   // 문자열 비교
```

### 2.2 격자 색인 (`grid.ts`)

```
buildGrid(input):
  byKey: Map<`${userId}|${date}`, GridCell>   // cells + prevTail. 중복이면 DomainInputError
  cellAt(userId, date) → GridCell | undefined
  token(cell) = cell ? (isRestCode(cell.code) ? 'OFF' : cell.code) : '∅'
  timeline(userId) = [tailStart … 말일]의 날짜 배열 (tailStart = 1일 − requiredTailDays)
```

### 2.3 인원 집계 (`staffing.ts`)

```
countStaff(ctx, date, s):                        // s ∈ D,E,N
  members = nurses.filter(n => rotating(n) && isEmployed(n, date) && cellAt(n, date)?.code == s
                               && !triple(n, date, s))
  triple(n, d, s) = inTriplePeriod(n, d) || (s == N && tripleNightDates(n).has(d))

tripleNightDates(trainee):                        // R-STAFF-5, 트레이닝마다 한 번 계산
  ns = 대상 월에서 tripleStaffUntil < d ≤ endDate 이고 code == N 인 날짜(오름차순)
  return ns.slice(0, max(0, tripleNightCount − tripleNightsBefore))
  kTass   = members.filter(n => n.kTass && !inTraining(n, date)).length
  heads   = nurses.filter(n => fixedWeekday(n) && isEmployed(n, date) && cellAt(n, date)?.code == s)   // 수간호사 보충
  all     = members + heads
  return { count: members.length, kTass, fallback: heads.length, fallbackKTass: heads.filter(kTass).length,
           allJunior: all.length > 0 && all.every(junior), members }
```

### 2.4 검사기 (`checker/`)

```
checkSchedule(input):
  validateInput(input)                           // business-rules §2, 실패 시 throw
  ctx = buildContext(input)                      // grid, holidaySet, trainings by trainee, 대상 월 날짜
  out = []
  for n in nurses where rotating:                // 사람 단위 규칙
    out += checkCells(n)                         // H-CELL
    out += checkPatterns(n)                      // H-PATTERN: timeline 위 창 이동, 창에 대상 월 날짜가 있어야 보고
    out += checkRest(n)                          // H-REST
    out += checkRuns(n)                          // H-NIGHT-CONSEC, H-OFF-CONSEC (구간은 timeline 전체에서, 보고는 R-SCOPE-3)
    out += checkMonthCounts(n)                   // H-NIGHT-MAX, S-NIGHT-TARGET, H-SLEEPING
    out += checkOffAfterNight(n)                 // S-OFF-AFTER-N
    out += checkRequests(n)                      // H-SPECIAL-REQ, S-REQUEST
    out += checkEduUnion(n)                      // H-EDU-UNION
    if toggles.weekendPairOffMonthly: out += checkWeekendPair(n)
  for t in trainings: out += checkTraining(t)    // H-TRAINING
  for d in 대상 월, s in D,E,N:                  // 칸 단위 규칙
    c = countStaff(ctx, d, s)
    if c.count + c.fallback < minStaffPerShift        → H-STAFF
    if c.kTass + c.fallbackKTass < minKTass            → H-KTASS
    if (H-STAFF·H-KTASS 아님) && (c.count < minStaffPerShift || c.kTass < minKTass) → S-HEAD-FILL
    if toggles.avoidJuniorOnly && c.allJunior → S-JUNIOR-ONLY
  if toggles.minimizeRepeatPairs: out += checkRepeatPairs(ctx)
  return split(sort(out))                        // severity로 나눔, INV1 정렬
```

**연속 구간(`checkRuns`)**
```
runs(timeline, isMember, weight):   // weight: 칸 → 0 | 1, isMember: 구간을 끊지 않는 칸
  OFF 구간: isMember = 쉬는 칸, weight = (LEAVE ? 0 : 1)      // Q2
  N 구간:   isMember = code == N, weight = 1
  합계 > 상한이면 위반 1건(구간의 모든 날짜를 dates에 넣음). 한 구간은 한 번만 보고한다.
```

**휴식(`checkRest`)**
```
for 인접 (a, b) in timeline:
  if work(a) && work(b) && a.code != b.code:
    endA   = minutes(SHIFT_TIMES[a].end) + (endsNextDay ? 1440 : 0)
    startB = 1440 + minutes(SHIFT_TIMES[b].start)
    rest   = (startB − endA) / 60
    if rest < minRestHours → H-REST { restHours: rest, min }
```
결과 예(기본값): E→D 8h, N→E 7h, N→D −0.5h, N→S 1.5h, S→D 13h, E→S 10h가 위반이고 D→E 23h, E→N 23.5h, D→N 31h, D→S 17.5h, S→E 20.5h, S→N 28.5h는 통과한다.

**N 후 OFF(`checkOffAfterNight`)**
```
for 타임라인(전월 꼬리 포함)에서 끝나는 각 N 구간(마지막 N = 날짜 e), 구간 + 다음 근무가 대상 월에 닿는 것만:
  k = e 다음날부터 연속 쉬는 칸 수(칸 없음/월 밖에서 멈춤)
  다음 칸이 월 밖이거나 없으면 skip
  if k < offAfterNight → S-OFF-AFTER-N { rest: k, next: 다음 근무 코드 }   // k=0은 이미 H-PATTERN/H-REST
```

**반복 겹침(`checkRepeatPairs`)**
```
cnt[(a,b)] = 대상 월에서 같은 날 같은 듀티(D/E/N)에 함께 선 횟수 (a<b, 집계 인원 기준이 아니라 코드 기준, 교대 근무자·재직일만)
  단 그날 a–b가 트레이닝 중 신규–프리셉터 쌍이면 세지 않음
mean = Σcnt / C(교대 근무자 수, 2)   (대상 월에 재직일이 있는 교대 근무자)
threshold = max(4, ceil(2 × mean))
cnt ≥ threshold인 쌍마다 S-REPEAT-PAIR { count, threshold }
```

### 2.5 정산 (`settlement.ts`)

```
baselineOff(nurse, y, m, holidays) = |{ d ∈ monthDates(y,m) : isEmployed(nurse, d) && isRedDay(d) }|

settleMonth({ nurse, y, m, cells(그 사람의 대상 월 칸), holidays, sleepingOffPerN }):
  cnt = 코드·offKind·leaveKind별 개수
  actualOff  = cnt.OFF.regular + cnt.OFF.edu_cont + cnt.OFF.edu_union
  sleeping   = cnt.OFF.sleeping
  nightCount = cnt.N
  baseline   = nurse.rotation == fixed_weekday ? actualOff : baselineOff(...)
  offCarryAfter  = nurse.offCarryBefore + actualOff − baseline
  nightBankAfter = nurse.nightBankBefore + nightCount − sleepingOffPerN × sleeping
  entries = nonZero([
    off_carry: actualOff − baseline, night_bank: nightCount − sleepingOffPerN × sleeping,
    annual_leave: −cnt.AL, special_leave: −cnt.OFF.special, founding_off: −cnt.OFF.founding,
    checkup: −0.5 × cnt.checkupHalf, sick_leave: −cnt.LEAVE.sick,
    edu_cont: +cnt.OFF.edu_cont, edu_union: +cnt.OFF.edu_union ])
  weekendPairAchieved = hasWeekendPair(cells, y, m)
  return { …, entries }

reverseEntries(entries) = entries.map(e => ({ account: e.account, delta: −e.delta }))
summarizeNurse(cells) = { D, E, N, S, OFF, AL, LEAVE } 개수   // S8 "간호사별 배정 요약"
```
- 부동소수 누적을 막기 위해 0.5 단위 값은 `round1(x) = Math.round(x * 10) / 10`으로 정리한다.

### 2.6 위반 문구 (`checker/format.ts`)

`formatViolation(v, nameOf) → { title, detail }`. 날짜는 `M/D`, 요일이 필요하면 `M/D (요일)`.

| ruleId | title | detail |
|---|---|---|
| H-CELL | `{이름} · 근무 미배정` | `{날짜들}` |
| H-PATTERN | `{이름} · {패턴} 금지 패턴` | `{시작}~{끝}` |
| H-REST | `{이름} · 휴식 {h}시간` | `{날짜} {a} → {날짜} {b} ({min}시간 미만)` |
| H-NIGHT-MAX | `{이름} · 나이트 {n}개` | `월 상한 {max}개` |
| H-NIGHT-CONSEC | `{이름} · 연속 나이트 {n}일` | `{시작}~{끝} (상한 {max}일)` |
| H-OFF-CONSEC | `{이름} · 연속 오프 {n}일` | `{시작}~{끝} (상한 {max}일)` |
| H-STAFF | `{날짜} {s} 인원 {n}명` | `최소 {min}명` |
| H-KTASS | `{날짜} {s} K-tass {n}명` | `최소 {min}명` |
| H-TRAINING | `{신규} · 프리셉터와 다른 근무` | `{날짜} {신규 코드} / {프리셉터} {코드}` |
| H-SPECIAL-REQ | `{이름} · {연차/보수교육/노조교육} 신청 미반영` | `{날짜}` |
| H-SLEEPING | `{이름} · 슬리핑오프 {n}개` | `부여 가능 {k}개 (잔여 N {bank} + 이번 달 N {n})` |
| H-EDU-UNION | `{이름} · 노조교육 배정 불가` | `{날짜} {주말·공휴일 / 노조원 아님}` |
| S-NIGHT-TARGET | `{이름} · 나이트 {n}개` | `목표 {target}개 이하` |
| S-OFF-AFTER-N | `{이름} · N-OFF-{x} 1회` | `{시작}~{끝}` (핸드오프 S8 예시 문구) |
| S-WEEKEND-PAIR | `{이름} · 주말 연휴 OFF 미배정` | 전달도 미배정이면 `{전달}월도 미배정 → {다음 달}월 최우선`, 아니면 `{다음 달}월 우선 대상` |
| S-HEAD-FILL | `{날짜} {s} 수간호사로 인원 충족` | `교대 근무자 {n}명 · K-tass {k}명 (최후의 수단)` |
| S-JUNIOR-ONLY | `{날짜} {s} 저연차만 배정` | `{이름들}` |
| S-REPEAT-PAIR | `{이름A}·{이름B} · 같은 근무 {n}회` | `경고 기준 {threshold}회` |
| S-REQUEST | `{이름} · 신청 불충족` | `{날짜} 신청 {O/D} → 배정 {코드}` |

### 2.7 셀 출처 (`cell-source.ts`)

```
resolveCellSource(cell, request?, adminEdited):
  if adminEdited → 'admin'
  if cell.code ∈ {AL, LEAVE} → 'requested'
  if request?.special → matchesSpecial(cell, special) ? 'requested' : 'auto'
  if request?.options 만족 → 'requested'
  return 'auto'
```

### 2.8 특휴·개원오프 (`leave.ts`)

```
employedDaysInYear(y, from, until) = max(0, diffDays(min(y-12-31, until ?? ∞), max(y-01-01, from ?? −∞)) + 1)
specialLeaveDays(days) = min(5, floor((10 × days + 365) / 730))
defaultTripleStaffUntil(start, kind, params) = addDays(start, 7 × weeks(kind) − 1)   // new_grad 3주, experienced 2주
foundingOffEligible(nurse, y, holidays) = foundingDay(y) ? isEmployed(nurse, foundingDay) : null
```

## 3. 상태 전이 — MonthPlan (`month-plan.ts`)

| 현재 | 이벤트 | 다음 | 가드 |
|---|---|---|---|
| REQUESTING | CLOSE_REQUESTS | REQUEST_CLOSED | — (호출자가 마감일 경과 또는 관리자 동작을 판단) |
| REQUEST_CLOSED | GENERATE | DRAFTING | — |
| DRAFTING | GENERATE | DRAFTING | 리롤 |
| DRAFTING | CONFIRM | CONFIRMED | 호출자가 하드 위반 0 확인 |
| CONFIRMED | ADJUST | CONFIRMED | 하드 위반 0 |
| CONFIRMED | CLOSE | CLOSED | `today > 대상 월 말일`(인자) |
| CLOSED | REOPEN | CONFIRMED | — |
| 그 외 | * | `PlanTransitionError` | |

`canNurseEditRequests(status, requestDeadline, today) = status == REQUESTING && today ≤ requestDeadline`

## 4. 시퀀스 — 솔버 재검사(2-6)와 S9 즉시 검사(2-7)

1. 서버가 DB에서 `ScheduleInput`을 조립한다(전월 꼬리는 전월 확정본 `schedule_cells`, 없으면 빈 배열).
2. 솔버 결과 칸을 `cells`로 넣어 `checkSchedule` → 하드 위반이 있으면 그 안을 버리고 버그로 기록(1-3 §3).
3. S9: 브라우저가 같은 `ScheduleInput`(코멘트 없음)을 받아, 셀을 바꿀 때마다 전체를 다시 검사한다(§NFR 50ms). 저장 시 서버가 다시 검사한다.

## 5. 통합 지점

N/A — 외부 호출 없음. 솔버 계약(`packages/contract`)은 2-6에서 이 타입을 기준으로 만든다.

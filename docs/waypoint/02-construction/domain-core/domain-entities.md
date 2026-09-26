---
artifact: domain-entities
build-spec: domain-core
status: IMPLEMENTED
updated: 2026-09-27
---

# Domain & Entities — 2-2 Domain Core

> `@duty/domain`의 **입력·출력 타입 계약**이다. DB 행이 아니라 순수 함수가 받는 값이며, DB 행 → 도메인 입력 변환은
> 각 화면 스테이지(2-3~2-7)의 서버 계층이 맡는다. 2-1에서 만든 allowed-set·`RuleSet`·`Cell`·`SHIFT_TIMES`를 그대로 쓴다.

## 1. 엔티티 개요

| 타입 | 설명 | 영속성 | SoT |
|---|---|---|---|
| `IsoDate` | `'YYYY-MM-DD'` 문자열(Asia/Seoul 달력 날짜). 시각 없음 | — | 1-3 §6 시간대 |
| `NurseProfile` | 검사·정산에 필요한 간호사 속성 + 월초 잔여치 | `users` + 원장 합계에서 조립 | 1-2 §2 User, §7 |
| `TrainingSpan` | 신규–프리셉터 기간 | `trainings` | 1-2 §2 Training |
| `HolidayDay` | 공휴일 날짜·종류 | `holidays` | 1-2 §2 Holiday |
| `GridCell` | 한 칸(사람·날짜·코드) | `candidate_cells`/`schedule_cells` | 1-2 §2 ShiftCell |
| `RequestEntry` | 한 사람·한 날짜의 근무 신청 | `shift_requests` | 1-2 §2 ShiftRequest |
| `ScheduleInput` | 검사기 입력 전체(한 달 + 전월 꼬리) | 조립 | 1-2 §9, 1-3 §4 |
| `Violation` | 검사 결과 1건(하드/소프트) | `schedule_candidates.check_result`(JSON) | 1-3 §4 |
| `CheckResult` | `{ hardViolations, softWarnings }` | 동일 | 1-2 §9 |
| `SettlementResult` | 인당 월 정산 결과 + 원장 증감 | `month_settlements` + `balance_entries` | 1-2 §2 MonthSettlement, §4 |
| `PlanEvent` | 근무표 상태 전이 이벤트 | — | 1-2 §3 |

## 2. 엔티티 상세

### `IsoDate`
- `type IsoDate = string` + 검증 함수 `isIsoDate(s)`(정규식 `^\d{4}-\d{2}-\d{2}$` + 실제 달력 날짜).
- 요일·일 더하기는 `Date.UTC` 기반으로 계산한다. 로컬 시간대(`new Date('2026-10-01')`의 해석 차이)에 의존하지 않는다.

### `NurseProfile`
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | `string` | ✓ | users.id |
| `rotation` | `Rotation` | ✓ | `fixed_weekday`는 사람 단위 검사에서 제외하고, 인원에는 최후의 수단으로만 센다(R-SCOPE-1, R-STAFF-4) |
| `seniorityTier` | `SeniorityTier` | ✓ | 저연차만 배정 방지 |
| `kTass` | `boolean` | ✓ | |
| `unionMember` | `boolean` | ✓ | 노조교육 OFF 검증 |
| `employedFrom` | `IsoDate \| null` | ✓ | 입사일(없으면 무제한 과거) |
| `employedUntil` | `IsoDate \| null` | ✓ | 마지막 재직일(포함). 서버가 `deactivatedAt`의 Asia/Seoul 날짜 **전날**로 변환한다 |
| `nightDedicated` | `{ from: IsoDate; to: IsoDate } \| null` | ✓ | 야간 전담 기간 |
| `offCarryBefore` | `number` | ✓ | 월초 누적 OFF(원장 `off_carry` 합). 0.5 단위 |
| `nightBankBefore` | `number` | ✓ | 월초 잔여 N(원장 `night_bank` 합). 정수 |
| `weekendPairMissedLastMonth` | `boolean` | ✓ | 전달 `month_settlements.weekend_pair_achieved = false`. 전달 정산이 없으면 `false` |
| `weekendPairCarryIn` | `boolean` | ✓ | 전달 칸에 `weekendPairCarryOut`을 적용한 값(마지막 토요일 OFF에 기대 달성 예정) |

### `TrainingSpan`
| 필드 | 타입 | 설명 |
|---|---|---|
| `traineeId`, `preceptorId` | `string` | |
| `kind` | `TraineeKind` | `new_grad`(완전 신규) · `experienced`(타 병원 경력) |
| `startDate`, `endDate` | `IsoDate` | 트레이닝 기간(양끝 포함) |
| `tripleStaffUntil` | `IsoDate` | 3인 배정 마지막 날(포함). 기본값 = `defaultTripleStaffUntil(startDate, kind, params)`, 등록 시 수정 가능 |
| `tripleNightsBefore` | `number` | 3인 배정 기간 뒤 대상 월 이전까지 신규가 선 N 수(서버가 이전 확정본에서 센다). 3인 나이트 순번 계산용 |

### `HolidayDay`
`{ date: IsoDate; kind: HolidayKind }` — `founding_day`는 빨간 날·기준 OFF에서 제외한다(R-BASE-1).

### `GridCell`
2-1 `CellSchema`에서 `source`를 뺀 모양 + 위치.

| 필드 | 타입 | 설명 |
|---|---|---|
| `userId` | `string` | |
| `date` | `IsoDate` | |
| `code` | `ShiftCode` | `D E N S OFF AL LEAVE` |
| `offKind` | `OffKind?` | code=OFF일 때 필수 |
| `leaveKind` | `LeaveKind?` | code=LEAVE일 때 필수 |
| `checkupHalf` | `boolean` | 검진 반차 표시 |

- **근무 칸** = `D E N S`. **쉬는 칸** = `OFF AL LEAVE`(`isRestCode`).
- 패턴 토큰: 근무 칸은 코드 그대로, 쉬는 칸은 `OFF`(질문 Q3 기본안). 칸 없음은 토큰 `∅`로, 어떤 패턴과도 일치하지 않는다.

### `RequestEntry`
`{ userId, date, options: RequestOption[], special?: RequestSpecial }` — 코멘트는 검사에 쓰지 않으므로 넣지 않는다
(권한상 코멘트가 도메인 계층을 거칠 이유를 없앤다).

### `ScheduleInput`
| 필드 | 타입 | 설명 |
|---|---|---|
| `year`, `month` | `number` | 대상 월 |
| `rules` | `RuleSet` | 이 근무표가 고정한 규칙 버전(1-2 §2 RuleVersion) |
| `nurses` | `NurseProfile[]` | 수간호사 포함 가능(검사에서 제외됨) |
| `trainings` | `TrainingSpan[]` | 대상 월과 겹치는 것 |
| `holidays` | `HolidayDay[]` | 대상 월 + 전월 꼬리 기간 |
| `cells` | `GridCell[]` | 대상 월 칸 |
| `nextHead` | `GridCell[]` | 다음 달 1일 칸(다음 달 근무표가 있을 때만, 없으면 빈 배열). 달을 걸친 주말 판정용 |
| `prevTail` | `GridCell[]` | 전월 마지막 `requiredTailDays(rules)`일의 칸(없으면 빈 배열 — 첫 달) |
| `requests` | `RequestEntry[]` | 대상 월 신청 |

### `Violation`
| 필드 | 타입 | 설명 |
|---|---|---|
| `ruleId` | `RuleId` | §4 allowed-set |
| `severity` | `'hard' \| 'soft'` | ruleId에서 결정(고정 매핑) |
| `userIds` | `string[]` | 관련 간호사(인원 규칙은 그 칸의 근무자, 반복 겹침은 두 사람) |
| `dates` | `IsoDate[]` | 관련 날짜(오름차순). 전월 꼬리 날짜를 포함할 수 있다 |
| `shift` | `'D' \| 'E' \| 'N'`? | 인원 규칙에만 |
| `data` | ruleId별 구조체 | 예: `{ pattern: 'E-D' }`, `{ restHours: 8, min: 16 }`, `{ count: 1, min: 2 }` |

- 표시 문구는 `formatViolation(v, nameOf)`가 만든다(business-logic-model §2.6). 검사기는 이름을 모른다.

### `SettlementResult`
| 필드 | 타입 | 설명 |
|---|---|---|
| `baselineOff` | `number` | fixed_weekday는 `actualOff`와 같게 기록 |
| `actualOff` | `number` | OFF regular + edu_cont + edu_union 칸 수 |
| `sleepingOff` | `number` | OFF sleeping 칸 수 |
| `nightCount` | `number` | N 칸 수 |
| `offCarryBefore/After` | `number` | |
| `nightBankBefore/After` | `number` | |
| `weekendPairAchieved` | `boolean` | |
| `specialUsed`, `foundingUsed`, `checkupUsed` | `number` | 개수(검진은 0.5 단위) |
| `eduCont`, `eduUnion` | `number` | 이수 횟수 |
| `annualUsed`, `sickUsed` | `number` | AL 칸, LEAVE sick 칸 |
| `entries` | `{ account: BalanceAccount; delta: number }[]` | 0이 아닌 증감만. `reason='month_settlement'`는 호출자가 붙인다 |

> `month_settlements`에 `edu_union` 컬럼이 없다. 원장에는 기록하고 스냅샷 컬럼 추가는 2-7(월 마감)에서 결정한다.

## 3. 관계

| 좌 | 카디널리티 | 우 | 비고 |
|---|---|---|---|
| `ScheduleInput` | 1─* | `GridCell` | (userId, date) 유일(R-INPUT-1) |
| `NurseProfile` | 1─0..1 | `TrainingSpan`(trainee) | 한 달에 한 기간만 겹친다고 가정하지 않는다(여러 개 허용) |
| `NurseProfile` | 1─* | `RequestEntry` | (userId, date) 유일 |

## 4. 열거형 / Allowed-set (신규)

| 이름 | 값 | 확장 규칙 |
|---|---|---|
| `HARD_RULE_IDS` | `H-CELL`, `H-PATTERN`, `H-REST`, `H-NIGHT-MAX`, `H-NIGHT-CONSEC`, `H-OFF-CONSEC`, `H-STAFF`, `H-KTASS`, `H-TRAINING`, `H-SPECIAL-REQ`, `H-SLEEPING`, `H-EDU-UNION` | 추가만 |
| `SOFT_RULE_IDS` | `S-NIGHT-TARGET`, `S-OFF-AFTER-N`, `S-WEEKEND-PAIR`, `S-WEEKEND-CARRY`, `S-SHIFT-BALANCE`, `S-HEAD-FILL`, `S-JUNIOR-ONLY`, `S-REPEAT-PAIR`, `S-REQUEST` | 추가만 |
| `TRAINEE_KINDS` | `new_grad`, `experienced` | 추가만. DB `trainings.kind`(text, 기본 `new_grad`) |
| `PLAN_EVENTS` | `CLOSE_REQUESTS`, `GENERATE`, `CONFIRM`, `ADJUST`, `CLOSE`, `REOPEN` | 추가만 |
| `WORK_CODES` | `D E N S` | — |
| `REST_CODES` | `OFF AL LEAVE` | — |

## 5. SoT 매핑

| SoT 요소 | 타입.필드 | 비고 |
|---|---|---|
| 1-2 §9 "셀 격자, 사용자 속성, RuleVersion, Holiday, 전월 말 3일, 신청" | `ScheduleInput` | 전월은 3일이 아니라 `requiredTailDays`(연속 OFF 상한 15일을 잡으려면 15일 필요) |
| 1-2 §9 `{ hardViolations[], softWarnings[] }` | `CheckResult` | |
| 1-2 §2 MonthSettlement 컬럼 | `SettlementResult` | `eduUnion`·`annualUsed`·`sickUsed` 추가(원장용) |
| 1-2 §4 원장 계정 | `SettlementResult.entries[].account` | |
| 1-2 §7 인원 계산 | `countStaff()` 결과 `{ count, kTass, fallback, fallbackKTass, allJunior, members }` | business-logic-model §2.3 |
| 1-2 §5 셀 출처 | `resolveCellSource()` | |
| 1-2 §3 MonthPlan 전이 | `nextPlanStatus()` | |
| 원문 §6-7 특휴 산식 | `specialLeaveDays()` | |

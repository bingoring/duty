---
artifact: domain-entities
build-spec: schedule-view
status: IMPLEMENTED
updated: 2026-09-27
---

# Domain & Entities — 2-3 근무표 조회

> DB 스키마는 바꾸지 않는다(2-1 16 테이블). 여기는 서버 계층의 원자료·뷰 모델 타입이다.

## 1. 원자료 `MonthViewData` (load.ts → view.ts)

| 필드 | 타입 | 설명 |
|---|---|---|
| `year`, `month` | `number` | 보는 달 |
| `today` | `IsoDate` | 서울 기준 오늘 |
| `viewerId` | `string` | 로그인 사용자 |
| `plan` | `{ status, confirmedByName, closedByName } \| null` | 보는 달의 MonthPlan. 없으면 null |
| `nextPlan` | `{ status, negotiationStart, negotiationEnd } \| null` | 다음 달 MonthPlan(헤더 링크·하단 협의 기간) |
| `rules` | `RuleSet` | 현재 규칙(하단 문구의 마감일) |
| `users` | `ViewUser[]` | 행 후보(§2) |
| `cells` | `ScheduleCellRow[]` | 보는 달 `schedule_cells`(확정·마감일 때만) |
| `holidays` | `HolidayDay[]` | 보는 달 + 그해 개원기념일 |
| `balances` | `Map<userId, RowBalance>` | §3 |
| `todayCell` | `ScheduleCellRow \| null` | 오늘이 속한 달의 확정본에서 로그인 사용자의 오늘 칸 |

### `ViewUser`
`{ id, name, rotation, seniorityRank, employedFrom, employedUntil }` — 보는 달에 칸이 있거나, 활성이고 그달에 재직일이 있는 사용자.

### `ScheduleCellRow`
2-2 `GridCell` + `source: CellSource`.

## 2. 뷰 모델 `ScheduleView` (view.ts → 컴포넌트)

| 필드 | 타입 | 설명 |
|---|---|---|
| `title` | `string` | "2026년 10월 · 응급실 근무표" |
| `prev`, `next` | `string` | `?ym=` 링크 값 |
| `badge` | `{ kind: 'confirmed' \| 'closed'; text } \| null` | "확정 · 담당 한수정" / "마감 · 담당 한수정" |
| `nextMonthLink` | `{ ym, text } \| null` | 이번 달을 볼 때 다음 달이 확정됐으면 "11월 근무표 확정됨" |
| `empty` | `{ text; adminLink? } \| null` | 확정·마감이 아니면 빈 상태 |
| `days` | `DayHead[]` | `{ date, day, weekday, red, color: 'sun' \| 'sat' \| 'plain' }` |
| `rows` | `GridRow[]` | §2.1 |
| `cards` | `SummaryCards \| null` | §2.2 (보는 사용자에게 행이 없으면 null) |
| `footer` | `string` | 하단 안내 |
| `gridTemplate` | `string` | `68px 36px 36px repeat(n,24px) 34px 34px 34px 34px 34px` |

### 2.1 `GridRow`
| 필드 | 설명 |
|---|---|
| `userId`, `name` | |
| `kind` | `'head' \| 'me' \| 'other'` (`head` = fixed_weekday. 로그인 사용자가 head이면 `me`로 강조하고 맨 위에 둔다) |
| `carryOff`, `carryN` | 이월 off(`offCarryBefore`), 이월 N(`nightBankBefore`) — 표시 문자열 |
| `cells` | `GridCellView[]` 날짜 순(칸 없음 포함) |
| `accOff` | 누적 off 표시("+4", "−2", "0") |
| `nLeft` | ⓝN(`nightBankAfter`) |
| `special` | 특휴/개원 "2/1" 또는 "2/-" |
| `checkup` | 검진 잔여 "0.5" |
| `bo` | 보수교육 올해 이수 횟수 |

### `GridCellView`
`{ date, label: 'D'|'E'|'N'|'S'|'off'|'휴'|'', chip: 'd'|'e'|'n'|'s'|'off'|'leave'|null, outline: 'admin'|'requested'|null, checkupHalf, weekend, title }`

### 2.2 `SummaryCards`
| 카드 | 필드 |
|---|---|
| 오늘 | `todayLabel`("오늘 10/1 (목)"), `todayCode`("N"/"off"/"연차"/"휴가"/"—"), `todayTime`("22:30–07:30" 또는 "") |
| 이번달 OFF | `offCount`(정산 기준 OFF), `baseline` |
| 누적 OFF | `accText`("+4"), `accNote`("다음 달 반납 4" / "다음 달 2일 더 받음" / "기준과 같음") |
| 잔여 나이트 | `bankBefore`, `nights`, `sleeping` |
| 연차 / 특휴 | `annual`, `special` (월말 잔여) |

## 3. 잔여치 `RowBalance`

| 필드 | 출처 |
|---|---|
| `offCarryBefore/After`, `nightBankBefore/After` | 마감된 달: `month_settlements` 스냅샷 / 그 외: 원장 + 투영(business-logic-model §2) |
| `settlement` | `SettlementResult`(마감 안 된 달은 `settleMonth` 결과, 마감된 달은 스냅샷에서 복원) |
| `annual`, `special`, `founding`, `checkup` | 월말 잔여 |
| `foundingEligible` | `foundingOffEligible` (false·null → "-") |
| `eduContThisYear` | 올해 보수교육 이수 횟수(월말 기준) |

## 3.1 `LeaveBalanceSummary` (사이드바)
`{ annual, annualGranted, special, specialGranted, checkup, sick, offCarry, nightBank }` — R-SHELL-2.

## 4. SoT 매핑

| SoT | 필드 |
|---|---|
| 핸드오프 확정 2 "성명·이월 off·이월 N·1~31·누적 off·ⓝN·특휴/개원·검진·보" | `GridRow` |
| 1-2 §4 종이 우측 컬럼 매핑(누적 off = offCarryAfter, ⓝN = nightBankAfter, 잔여량) | `accOff`, `nLeft`, `special`, `checkup`, `bo` |
| S3 요약 카드 5개 | `SummaryCards` |
| S3 헤더 배지 "확정 · 담당 한수정" | `badge` |
| S3 하단 안내 | `footer` |

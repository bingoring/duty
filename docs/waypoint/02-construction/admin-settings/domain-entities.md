---
artifact: domain-entities
build-spec: admin-settings
status: IMPLEMENTED
updated: 2026-09-27
---

# Domain & Entities — 2-4 관리자 설정

> 스키마 변경 없음(2-1의 users·credentials·sessions·trainings·holidays·rule_versions·balance_entries를 쓴다). allowed-set만 보강한다.

## 1. Allowed-set 변경

| 이름 | 변경 |
|---|---|
| `HOLIDAY_SOURCES` | `['seed', 'admin']` → `['seed', 'admin', 'api']` |

## 2. 간호사 목록 행 `StaffRow`

| 필드 | 설명 |
|---|---|
| `id`, `employeeNo`, `name` | |
| `years` | 입사일부터 오늘까지 만 연수, 입사일이 없으면 null("—") |
| `kTass`, `seniorityTier`, `unionMember`, `rotation`, `role`, `seniorityRank`, `hireDate` | users |
| `roleLabel` | `'수간호사 · 관리자'`(fixed_weekday 또는 admin) · `'프리셉터'`(오늘 진행 중인 트레이닝의 프리셉터) · `'신규'`(오늘 트레이닝 중) · `'간호사'` |
| `training` | 진행 중(또는 예정) 트레이닝 `{ id, kind, preceptorId, preceptorName, startDate, endDate, tripleStaffUntil }` \| null |
| `trainingText` | `"~2026-12-31 · 프리셉터 서예린"` 또는 "—" |
| `balances` | 원장 현재 합계(연차·특휴·개원오프·검진·병가·누적 OFF·잔여 N) — 수정 창 잔여치 조정용 |

## 3. 입력 스키마 (zod, `server/admin/schemas.ts`)

### `StaffCreateInput`
| 필드 | 규칙 |
|---|---|
| `employeeNo` | `EmployeeNoSchema`(trim, 1~20자), 전역 유일(비활성 포함) |
| `name` | trim 1~20자 |
| `hireDate` | `YYYY-MM-DD` 또는 빈 값(신규 체크 시 필수) |
| `kTass` | boolean |
| `seniorityTier` | allowed-set, 필수 |
| `unionMember` | boolean |
| `rotation` | allowed-set, 기본 `rotating` |
| `role` | allowed-set, 기본 `nurse` |
| `annualLeave` | 0~40, 0.5 단위 |
| `nightBank` | 0~50 정수 |
| `offCarry` | −31~31, 0.5 단위 |
| `training` | `{ kind: TraineeKind; preceptorId; tripleWeeks: 0~12 }` \| 없음 |

### `StaffUpdateInput`
`StaffCreateInput`에서 사번·잔여치를 뺀 것 + `seniorityRank`(1~99) + `training`(없음이면 진행 중 트레이닝 종료 = 오늘 전날로 `endDate`).

### `BalanceAdjustInput`
`{ userId, account: 'annual_leave'|'special_leave'|'founding_off'|'checkup'|'sick_leave'|'off_carry'|'night_bank', value: number, note: string(1~200) }` — `value`는 **새 값**이고 서버가 차이를 원장에 넣는다.

### `RuleSaveInput`
`RuleSet`(params·toggles·forbiddenPatterns) + `baseVersion`(편집을 시작한 버전, 동시 저장 충돌 검사).

### `HolidayInput`
`{ date: IsoDate; name: 1~30자; kind: 'hospital'|'union_agreed'|'founding_day'|'public'|'substitute'|'election'|'labor_day' }`.

## 4. 규칙 편집 항목 `RULE_PARAM_LIMITS` (`packages/domain`)

| 키 | 라벨 | 종류 | 단위 | 범위 | 그룹 |
|---|---|---|---|---|---|
| minRestHours | 근무 간 최소 휴식 | 필수 | 시간 | 8~24 | 근무·휴식 |
| maxConsecutiveOff | 최대 연속 오프 | 필수 | 일 | 5~31 | 근무·휴식 |
| workDaysPerWeek | 주 근무일 | 필수 | 일 | 1~7 | 근무·휴식 |
| maxNightPerMonth | 월 나이트 상한 | 필수 | 개 | 1~31 | 나이트 |
| targetNightPerMonth | 월 나이트 목표 | 권고 | 개 | 1~31, ≤ 상한 | 나이트 |
| maxConsecutiveNight | 연속 나이트 상한 | 필수 | 일 | 1~7 | 나이트 |
| offAfterNight | N 후 OFF | 권고 | 개 | 0~4 | 나이트 |
| sleepingOffPerN | 슬리핑오프 기준 N | 필수 | 개 | 1~12 | 나이트 |
| minStaffPerShift | 듀티당 최소 인원 | 필수 | 명 | 1~10 | 인원·신규 |
| minKTass | K-tass 권한자 | 필수 | 명 이상 | 0~5, ≤ 최소 인원 | 인원·신규 |
| trainingMonths | 신규 트레이닝 기간 | 필수 | 개월 | 1~12 | 인원·신규 |
| newbieTripleWeeks | 3인 배정 기간(완전 신규) | 필수 | 주 | 0~12 | 인원·신규 |
| experiencedTripleWeeks | 3인 배정 기간(경력자) | 필수 | 주 | 0~12 | 인원·신규 |
| tripleNightCount | 기간 뒤 3인 나이트 | 필수 | 개 | 0~10 | 인원·신규 |
| shiftBalanceTolerance | D·E·N 차이 허용 | 권고 | 개 | 0~10 | 공정성 |
| shiftBalanceWindowMonths | D·E·N 누적 기간 | 권고 | 개월 | 1~12 | 공정성 |
| eduContPerYear | 보수교육 | 필수 | 회/년 | 0~5 | 교육 |
| eduUnionPerYear | 노조교육 | 필수 | 회/년 | 0~5 | 교육 |
| nightDedicatedMaxPerMonth | 야간 전담 월 상한 | 필수 | 일 | 1~31 | 야간 전담 |
| nightDedicatedMaxPerMonth31 | 야간 전담 월 상한(31일 달) | 필수 | 일 | 1~31, ≥ 위 값 | 야간 전담 |
| nightDedicatedMinMonths | 야간 전담 최소 기간 | 필수 | 개월 | 1~12 | 야간 전담 |
| nightDedicatedMaxMonths | 야간 전담 최대 기간 | 필수 | 개월 | 1~12, ≥ 최소 | 야간 전담 |
| requestDeadlineDay | 근무 신청 마감 | 운영 | 일 | 1~28 | 운영 |
| negotiationStartDay–EndDay | 협의 수정 기간 | 운영 | 일 | 마감 < 시작 ≤ 끝 ≤ 31 | 운영 |

토글 5개: 주말 통 OFF · 저연차만 배정 방지 · 반복 겹침 최소화 · 야간 전담 운영 · **D·E·N 고르게**(2-2 추가).

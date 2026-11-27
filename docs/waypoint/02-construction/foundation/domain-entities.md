---
artifact: domain-entities
build-spec: foundation
status: IMPLEMENTED
updated: 2026-09-26
---

# Domain & Entities — 2-1 Foundation

> 1-2 §2의 엔티티를 **테이블 계약**으로 옮긴다. 2-1은 16개 테이블을 모두 만들되, 행을 실제로 쓰는 것은
> `wards`·`users`·`credentials`·`sessions`·`holidays`·`rule_versions`뿐이다. 나머지는 후속 스테이지가 채운다.
>
> **공통 방침**
> - PK는 `uuid`(`gen_random_uuid()`), 원장 `balance_entries`만 `bigserial`. 시각은 `timestamptz`, 날짜는 `date`(Asia/Seoul 기준 달력 날짜).
> - DB 컬럼은 snake_case, TS 필드는 camelCase(Drizzle 매핑).
> - **allowed-set 컬럼은 `text`** 로 두고 값 검증은 `@duty/domain`의 zod 스키마가 한다(FRAMEWORK allowed-set 방침). DB는 PK·FK·UNIQUE·NOT NULL만 강제한다.
> - 1-3 §2의 "CHECK 제약으로 불변식 강제" 서술은 이 방침에 맞춰 **조건부 필수(예: code=OFF → offKind)를 코드 계층에서 검증**하는 것으로 구체화한다.

## 1. 엔티티 개요

| 엔티티 (테이블) | 설명 | 2-1에서 쓰기 | SoT |
|---|---|---|---|
| `wards` | 병동 | 시드 | 1-2 Ward |
| `users` | 간호사·관리자 | 시드·가져오기 | 1-2 User |
| `credentials` | 비밀번호·잠금 | 시드·로그인 | 1-2 User 인증 |
| `sessions` | 로그인 세션 | 로그인 | 1-3 §5 |
| `trainings` | 신규-프리셉터 | — (2-4) | 1-2 Training |
| `holidays` | 공휴일·병원 지정일 | 시드 | 1-2 Holiday |
| `rule_versions` | 병동 규칙 버전 | 시드(v1) | 1-2 RuleVersion |
| `month_plans` | 월 근무표 생명주기 | — (2-5~2-7) | 1-2 MonthPlan |
| `schedule_candidates` | 생성안(n번째 안) | — (2-6) | 1-2 ScheduleCandidate |
| `candidate_cells` | 생성안의 칸(불변) | — (2-6) | 1-2 ShiftCell |
| `schedule_cells` | 확정본의 칸(조정 가능) | — (2-6·2-7) | 1-2 ShiftCell |
| `cell_edit_logs` | 칸 수정 이력 | — (2-7) | 1-2 CellEditLog |
| `shift_requests` | 근무 신청 | — (2-5) | 1-2 ShiftRequest |
| `leave_requests` | 휴가 신청 | — (2차) | 1-2 LeaveRequest |
| `balance_entries` | 잔여치 원장 | — (2-4·2-7) | 1-2 BalanceEntry |
| `month_settlements` | 월 정산 스냅샷 | — (2-7) | 1-2 MonthSettlement |

> **1-2 대비 구체화:** 1-2의 `ShiftCell { ownerId(candidateId 또는 확정본) }`을 **`candidate_cells`(생성안, 불변)와 `schedule_cells`(확정본, 조정 가능)
> 두 테이블**로 나눈다. 확정 시 생성안의 칸을 확정본으로 복사한다. 근거: 생성안 이력(리롤 비교)은 바뀌면 안 되고, 확정본은 관리자 조정으로
> 계속 바뀌므로 수명과 쓰기 규칙이 다르다. 두 테이블의 칸 컬럼 모양은 같다.

## 2. 엔티티 상세

### `wards`
| 필드 | 타입 | 필수 | 기본값 | 제약 | 설명 |
|---|---|---|---|---|---|
| id | uuid | ✅ | random | PK | |
| code | text | ✅ | | UNIQUE | `ER` |
| name | text | ✅ | | | `응급실` |

### `users`
| 필드 | 타입 | 필수 | 기본값 | 제약/allowed-set | 설명 |
|---|---|---|---|---|---|
| id | uuid | ✅ | random | PK | |
| ward_id | uuid | ✅ | | FK wards | |
| employee_no | text | ✅ | | **UNIQUE**, trim 후 1~20자 | 사번. 문자열이라 앞자리 0 보존 |
| name | text | ✅ | | 1~20자 | |
| role | text | ✅ | `nurse` | `ROLES` | 권한 |
| rotation | text | ✅ | `rotating` | `ROTATIONS` | 근무 방식 |
| seniority_rank | int | ✅ | | ≥1 | 격자 정렬(고연차 → 저연차) |
| seniority_tier | text | ✅ | | `SENIORITY_TIERS` | |
| hire_date | date | | null | | 모르면 비움. 특휴·개원오프 계산 전 관리자가 입력(2-4) |
| k_tass | boolean | ✅ | false | | |
| union_member | boolean | ✅ | false | | 노조교육 대상 |
| night_dedicated_from / _to | date | | null | 둘 다 있거나 둘 다 없음 | 야간 전담 기간 |
| active | boolean | ✅ | true | | |
| deactivated_at | timestamptz | | null | active=false일 때만 값 | |
| onboarded_year | int | | null | | S2 초기 설정 완료 연도(2차) |
| created_at / updated_at | timestamptz | ✅ | now() | | |

### `credentials`
| 필드 | 타입 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| user_id | uuid | ✅ | | PK, FK users (ON DELETE CASCADE) |
| password_hash | text | ✅ | | argon2id PHC 문자열 |
| must_change_password | boolean | ✅ | true | 임시 비밀번호 상태 |
| failed_count | int | ✅ | 0 | 연속 실패 횟수 |
| locked_until | timestamptz | | null | |
| password_changed_at | timestamptz | | null | |

### `sessions`
| 필드 | 타입 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| id | text | ✅ | | PK = 토큰의 SHA-256 hex. **원본 토큰은 저장하지 않음** |
| user_id | uuid | ✅ | | FK users (CASCADE), 인덱스 |
| persistent | boolean | ✅ | | "로그인 유지" 여부 |
| expires_at | timestamptz | ✅ | | |
| created_at / last_seen_at | timestamptz | ✅ | now() | |
| user_agent | text | | null | 앞 200자 |

### `trainings`
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| id | uuid | ✅ | PK |
| trainee_id / preceptor_id | uuid | ✅ | FK users |
| start_date / end_date | date | ✅ | end 기본 start+3개월(2-4에서 계산) |
| triple_staff_until | date | ✅ | 기본 start+3주, 수정 가능 |
| created_by | uuid | ✅ | FK users |
| created_at | timestamptz | ✅ | |

### `holidays`
| 필드 | 타입 | 필수 | 제약 | 설명 |
|---|---|---|---|---|
| id | uuid | ✅ | PK | |
| date | date | ✅ | **UNIQUE** | 하루에 한 행(설 연휴 3일은 3행) |
| name | text | ✅ | | 예: `개천절 대체공휴일` |
| kind | text | ✅ | `HOLIDAY_KINDS` | |
| source | text | ✅ | `seed` \| `admin` | |
| created_by | uuid | | FK users | 시드는 null |

### `rule_versions`
| 필드 | 타입 | 필수 | 제약 | 설명 |
|---|---|---|---|---|
| id | uuid | ✅ | PK | |
| ward_id | uuid | ✅ | FK | |
| version | int | ✅ | UNIQUE(ward_id, version) | 1부터 |
| params | jsonb | ✅ | `RuleParamsSchema` | §4 |
| toggles | jsonb | ✅ | `RuleTogglesSchema` | §4 |
| forbidden_patterns | jsonb | ✅ | `string[]`, 각 원소 `PATTERN_REGEX` | |
| diff | jsonb | ✅ | `[{key, before, after}]` | v1은 `[]` |
| changed_by | uuid | | FK users | 시드 v1은 null |
| changed_at | timestamptz | ✅ | | |

### `month_plans`
| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| id | uuid | ✅ | PK |
| ward_id, year, month | uuid, int, int | ✅ | UNIQUE(ward_id, year, month), month 1~12 |
| status | text | ✅ | `MONTH_PLAN_STATUSES` |
| request_deadline, negotiation_start, negotiation_end | date | ✅ | |
| rule_version | int | | 첫 생성 시 고정 |
| confirmed_candidate_id | uuid | | FK schedule_candidates |
| confirmed_by / closed_by | uuid | | FK users |
| confirmed_at / closed_at | timestamptz | | |

### `schedule_candidates`
| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| id | uuid | ✅ | PK |
| month_plan_id | uuid | ✅ | FK |
| generation_no | int | ✅ | UNIQUE(month_plan_id, generation_no) |
| seed | int | ✅ | |
| rule_version | int | ✅ | |
| check_result | jsonb | ✅ | `{hardViolations[], softWarnings[]}` |
| solver_meta | jsonb | | 상태·소요 시간·목적 값 |
| created_by | uuid | ✅ | FK users |
| created_at | timestamptz | ✅ | |

### `candidate_cells` / `schedule_cells` (칸 컬럼 공통)
| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| candidate_id **또는** month_plan_id | uuid | ✅ | FK. PK = (소유자, user_id, date) |
| user_id | uuid | ✅ | FK users |
| date | date | ✅ | |
| code | text | ✅ | `SHIFT_CODES` |
| off_kind | text | | `OFF_KINDS`, code=OFF일 때 필수 |
| leave_kind | text | | `LEAVE_KINDS`, code=LEAVE일 때 필수 |
| checkup_half | boolean | ✅ | 기본 false |
| source | text | ✅ | `CELL_SOURCES` |
| edited_by / edited_at | uuid / timestamptz | | `schedule_cells`에만 |

### `cell_edit_logs`
`id uuid PK, month_plan_id FK, user_id FK, date, before jsonb, after jsonb, edited_by FK, edited_at, reason text(EDIT_REASONS)`

### `shift_requests`
| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| id | uuid | ✅ | PK |
| user_id | uuid | ✅ | FK, UNIQUE(user_id, date) |
| year, month, date | int, int, date | ✅ | 인덱스(year, month) |
| options | text[] | ✅ | `REQUEST_OPTIONS`의 부분집합, 빈 배열 가능 |
| special | text | | `REQUEST_SPECIALS` |
| comment | text | | 최대 500자 |
| created_at / updated_at | timestamptz | ✅ | |

### `leave_requests`
`id, user_id FK, type text(LEAVE_TYPES), reason_code text, start_date, end_date, days numeric(4,1), attachment_id uuid null, status text(LEAVE_STATUSES), decided_by FK null, decided_at null, reject_reason null, created_at`

### `balance_entries`
| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| id | bigserial | ✅ | PK |
| user_id | uuid | ✅ | FK, 인덱스(user_id, account) |
| account | text | ✅ | `BALANCE_ACCOUNTS` |
| delta | numeric(6,1) | ✅ | 검진 반차 0.5 때문에 소수 1자리 |
| reason | text | ✅ | `BALANCE_REASONS` |
| ref_year, ref_month | int | | |
| ref_id | uuid | | 휴가 신청 등 |
| created_by | uuid | | 시스템 정산은 null |
| created_at | timestamptz | ✅ | |
| note | text | | |

### `month_settlements`
PK(month_plan_id, user_id). 1-2 §2 MonthSettlement의 필드를 모두 컬럼으로 둔다(`baseline_off int`, `actual_off int`, `sleeping_off int`, `night_count int`,
`off_carry_before/after numeric(6,1)`, `night_bank_before/after int`, `weekend_pair_achieved boolean`, `special_used/founding_used/checkup_used numeric(4,1)`, `edu_cont int`).

## 3. 관계

| 좌 | 카디널리티 | 우 | 비고 |
|---|---|---|---|
| wards | 1─* | users, rule_versions, month_plans | 삭제 금지(RESTRICT) |
| users | 1─1 | credentials | CASCADE |
| users | 1─* | sessions | CASCADE |
| users | 1─* | shift_requests, leave_requests, balance_entries, trainings | RESTRICT — 사용자는 소프트 삭제만 한다 |
| month_plans | 1─* | schedule_candidates, schedule_cells, cell_edit_logs, month_settlements | RESTRICT |
| schedule_candidates | 1─* | candidate_cells | CASCADE(생성안 폐기 시) |

## 4. 열거형 / Allowed-set (`packages/domain/src/allowed-sets.ts`)

| 이름 | 값 | 확장 규칙 |
|---|---|---|
| `ROLES` | `nurse`, `admin` | 추가만 |
| `ROTATIONS` | `rotating`, `fixed_weekday` | 추가만 |
| `SENIORITY_TIERS` | `senior`, `mid`, `junior` | 고정 |
| `SHIFT_CODES` | `D`, `E`, `N`, `S`, `OFF`, `AL`, `LEAVE` | 추가만 |
| `OFF_KINDS` | `regular`, `sleeping`, `edu_cont`, `edu_union`, `special`, `founding` | 추가만 |
| `LEAVE_KINDS` | `family`, `sick`, `official` | 추가만 |
| `CELL_SOURCES` | `auto`, `requested`, `admin` | 고정 |
| `REQUEST_OPTIONS` | `OFF`, `D`, `E`, `N` | 고정 |
| `REQUEST_SPECIALS` | `AL`, `EDU_CONT`, `EDU_UNION` | 추가만 |
| `HOLIDAY_KINDS` | `public`, `substitute`, `election`, `labor_day`, `hospital`, `union_agreed`, `founding_day` | 추가만 |
| `MONTH_PLAN_STATUSES` | `REQUESTING`, `REQUEST_CLOSED`, `DRAFTING`, `CONFIRMED`, `CLOSED` | 추가만 |
| `LEAVE_TYPES` | `family`, `sick`, `official`, `special`, `checkup` | 추가만 |
| `LEAVE_STATUSES` | `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED` | 추가만 |
| `BALANCE_ACCOUNTS` | `off_carry`, `night_bank`, `annual_leave`, `special_leave`, `founding_off`, `checkup`, `sick_leave`, `edu_cont`, `edu_union` | 추가만 |
| `BALANCE_REASONS` | `initial_input`, `month_settlement`, `admin_adjust`, `year_grant`, `year_reset`, `leave_approved`, `leave_cancelled` | 추가만 |
| `EDIT_REASONS` | `manual`, `swap`, `leave_approved` | 추가만 |

**`DEFAULT_RULES` (rule_versions v1, `packages/domain/src/rules-defaults.ts`)** — 핸드오프 S11 항목/기본값과 1:1

```ts
params = {
  minRestHours: 16, maxConsecutiveOff: 10, workDaysPerWeek: 5,
  maxNightPerMonth: 7, targetNightPerMonth: 6, maxConsecutiveNight: 3, offAfterNight: 2,
  minStaffPerShift: 2, minKTass: 1, newbieTripleWeeks: 3, trainingMonths: 3,
  sleepingOffPerN: 6, requestDeadlineDay: 15, negotiationStartDay: 16, negotiationEndDay: 20,
  nightDedicatedMaxPerMonth: 15, nightDedicatedMaxPerMonth31: 16,
  nightDedicatedMinMonths: 1, nightDedicatedMaxMonths: 6,
}
toggles = { weekendPairOffMonthly: true, avoidJuniorOnly: true, minimizeRepeatPairs: true, nightDedicated: false }
forbiddenPatterns = ['E-D', 'N-E', 'N-OFF-D', 'E-S']   // PATTERN_REGEX = /^(D|E|N|S|OFF)(-(D|E|N|S|OFF))+$/
```
- `targetNightPerMonth`·`trainingMonths`·`nightDedicated*`는 핸드오프 S11 목록에 없지만 원문(야간 운영 지침 §1·§3, 응급실 지침 §6)의 수치라 추가한다.
- 금지 패턴의 `off` 표기는 대문자 `OFF`로 정규화한다(핸드오프 `N-off-D` = `N-OFF-D`).

**`SHIFT_TIMES`** — 원문 §1·응급실 지침 §7. `{ D: ['07:00','15:30'], E: ['14:30','23:00'], N: ['22:30','07:30+1'], S: ['09:00','18:00'] }`

## 5. SoT 매핑

| SoT 요소 | 엔티티.필드 | 비고 |
|---|---|---|
| 핸드오프 `User.employeeNo(사번, unique, required)` | users.employee_no | text |
| 핸드오프 `User.years` | (파생) hire_date → 화면에서 계산 | 저장하지 않음 |
| 핸드오프 `User.isNewbie`·`preceptorId`·`trainingStart`·`trainingTripleWeeks` | trainings 테이블 | 1-2 결정 |
| 원문 명단 "고연차/중간연차/저연차" | users.seniority_tier | |
| 원문 명단 "노조" | users.union_member | |
| 원문 "수선생님, 교대근무하지 않고 빨간날에만 쉬는 사람" | users.rotation=`fixed_weekday`, role=`admin` | |
| 핸드오프 `UserBalance` | balance_entries(원장) | 1-2 결정 |
| 핸드오프 `WardRules` | rule_versions.params/toggles/forbidden_patterns | |
| 핸드오프 `ShiftCell.code 'AL'` | *_cells.code=`AL` | |

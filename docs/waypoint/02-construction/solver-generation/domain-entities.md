# domain-entities — 2-6 솔버·듀티 생성

## §1. 솔버 계약 (`packages/contract/src/solver.ts`, SoT)

zod 스키마가 SoT다. `pnpm --filter @duty/contract gen`이 `solver.schema.json`(JSON Schema 2020-12)을 만들고,
Python 쪽 `services/solver/solver/contract.py`(pydantic v2)는 `datamodel-codegen`으로 이 파일에서 생성한다. 두 생성물은 커밋하고,
CI가 다시 생성해 `git diff --exit-code`로 불일치를 잡는다.

```ts
SolverRequest = {
  seed: int ≥ 0
  timeLimitSec: number (0 < x ≤ 60)
  days: IsoDate[]                       // 대상 월 날짜
  redDays: IsoDate[]                    // 대상 월 + 앞뒤 꼬리의 빨간 날(주말·공휴일·병원 지정일)
  prevTail: { userId, date, code, offKind? }[]   // 전월 말 requiredTailDays일(확정본), 없으면 []
  nurses: {
    id: string
    kTass: boolean
    junior: boolean                     // seniorityTier === 'junior'
    workDays: IsoDate[]                 // 대상 월 중 재직일 (칸을 만들 날)
    fixed: { date, code: 'D'|'E'|'N'|'S'|'OFF'|'AL'|'LEAVE', offKind? }[]   // §3 고정 칸
    requests: { date, options: ('OFF'|'D'|'E'|'N')[] }[]                  // 복수 옵션 신청(고정 칸 날짜 제외)
    offTarget: number                   // 기준 OFF − 누적 OFF (0.5 단위 가능 → 솔버는 ×2 정수로 다룬다)
    nightBankBefore: int                // 월초 잔여 N
    nightMax: int                       // 월 N 상한(전담 여부 반영)
    nightTarget: int | null             // 권고 N 수, 전담이면 null
    sleepingOffPerN: int
    eduLeft: { cont: int, union: int }  // 올해 남은 교육 횟수(고정 칸 검증용)
    weekendMissedStreak: int            // 주말 통 OFF 미배정 연속 개월
    weekendCarryIn: boolean             // 1일(일)이 전월 마지막 토요일과 이어지는 주말
    shiftCountsBefore: { D, E, N }      // 최근 window−1개월 누적
    balanceShiftTypes: boolean          // 분포 검사 대상(전담·트레이닝 중 신규 제외)
    requestMissBefore: int              // 최근 3개월 신청 불충족 수 (Q3 가산)
  }[]
  heads: { id, kTass, cells: { date, code }[] }[]        // 수간호사 고정 칸 (인원 보충 계산용)
  trainings: { traineeId, preceptorId, startDate, endDate, tripleUntil, tripleNightsLeft }[]
  rules: { minStaff, minKTass, minRestHours, maxConsecutiveNight, maxConsecutiveOff,
           offAfterNight, forbiddenPatterns: string[], shiftBalanceTolerance, shiftBalanceWindowMonths }
  restHours: Record<'D'|'E'|'N'|'S', Record<'D'|'E'|'N'|'S', number>>   // TS SHIFT_TIMES로 계산해 넘김(이중 구현 방지)
  priorities: { requests, offAfterNight, weekendPair, avoidJuniorOnly, minimizeRepeatPairs }: boolean  // Q4
}

SolverResponse =
  | { status: 'OPTIMAL' | 'FEASIBLE', cells: { userId, date, code, offKind? }[],
      objective: { total: int, terms: Record<TermKey, int> }, wallTimeSec: number, seed: int }
  | { status: 'INFEASIBLE', causes: Cause[], wallTimeSec: number }
  | { status: 'UNKNOWN', wallTimeSec: number }            // 시간 안에 해도 불가능 증명도 못 함
Cause = { group: CauseGroup, userId?: string, date?: IsoDate, shift?: 'D'|'E'|'N' }
CauseGroup = 'STAFF' | 'KTASS' | 'NIGHT_MAX' | 'NIGHT_CONSEC' | 'OFF_CONSEC' | 'TRAINING' | 'FIXED' | 'SLEEPING'
TermKey = 'offShort' | 'offShortMax' | 'offOver' | 'requestMiss' | 'requestMissMax' | 'headFill' | 'weekendPair'
        | 'weekendCarry' | 'nightTarget' | 'offAfterNight' | 'sleepingShort' | 'shiftBalance' | 'juniorOnly'
        | 'repeatPair' | 'tieBreak'
```

- 출력 `cells`는 교대 근무자의 재직일 전부(고정 칸 포함)다. 수간호사 칸은 web이 입력 쪽 값을 그대로 쓴다.
- `offKind`: 솔버가 정하는 OFF는 `regular`·`sleeping` 둘 뿐이다. 고정 칸의 offKind(`edu_cont`·`edu_union`·`special`·`founding`)는 그대로 돌려준다.

## §2. 영속성 (기존 테이블, 마이그레이션 없음)

| 테이블 | 쓰는 방식 |
|---|---|
| `month_plans` | `status` REQUEST_CLOSED → DRAFTING(첫 생성) → CONFIRMED(확정). 확정 시 `confirmedCandidateId`·`confirmedBy`·`confirmedAt`·`ruleVersion` |
| `schedule_candidates` | 생성·리롤마다 1행. `generationNo`(1부터), `seed`, `ruleVersion`, `checkResult`(TS 재검사 결과), `solverMeta` |
| `candidate_cells` | 후보의 칸 전체(수간호사 포함). `source`: 신청 충족·고정 칸 = `requested`, 그 외 `auto` |
| `schedule_cells` | 확정 시 확정 후보의 칸을 복사(`editedBy` null) |

`solverMeta` 모양(jsonb, 코드에서 zod로 검증):
```ts
{ status: 'OPTIMAL'|'FEASIBLE', objective: {...}, wallTimeSec, inputHash: string /* sha256 hex */,
  priorities: {...}, prevMonthConfirmed: boolean, solverVersion: string }
```
불가능·시간 초과는 후보를 만들지 않는다(행 없음). 마지막 실패 결과는 화면 상태로만 돌려준다.

## §3. 고정 칸 (`packages/domain/src/generation.ts`)

우선순위가 높은 것이 이긴다.
1. **승인된 휴가**(`leave_requests.status = APPROVED`, 대상 월에 걸친 날짜) → 2-5 `applyLeave`와 같은 칸(연차 AL, 경조·병·공가 LEAVE+leaveKind, 특별휴가 OFF special, 검진 반차 checkupHalf).
2. **특수 신청**(`shift_requests.special`, 제출된 것) → AL / OFF edu_cont / OFF edu_union.
3. **수간호사**(`rotation = fixed_weekday`) → 빨간 날 OFF regular, 그 외 D. 본인의 제출된 OFF 신청은 OFF로 고정.
4. **S(K-tass 교육)** 는 2-6에서 만들지 않는다(2-7 조정에서 관리자가 넣음).

제출되지 않은(임시) 신청과 대기·반려 휴가는 입력에 넣지 않는다.

## §4. 화면 DTO (`server/generate/dto.ts`, 관리자 전용)

```ts
GenerateView = {
  year, month, planStatus: MonthPlanStatus | null
  canGenerate: boolean; blockedReason: string | null        // Q1: "10/15 신청 마감 뒤 생성할 수 있습니다" 등
  prevMonthConfirmed: boolean
  hard: { label: string; value: string }[]                  // 필수 조건 카드 (규칙 설정 값)
  forbiddenPatterns: string[]
  priorities: { key, label, checked, disabled }[]           // 우선 반영 기본값(규칙 토글) + 근무 신청 건수·코멘트 수
  candidates: { id, no, createdAt: 'HH:mm', seed }[]        // 최신이 마지막
  current: CandidateView | null                             // ?c= 로 선택, 기본 최신
  failure: { kind: 'INFEASIBLE'|'UNKNOWN'|'UNREACHABLE', causes: string[] } | null  // 직전 생성 실패(액션 결과)
}
CandidateView = {
  id, no, createdAt, stale: boolean                          // 입력 해시가 달라졌으면 true → 확정 불가
  hardCount: 0, softCount: int
  checks: { ok: boolean; title: string; detail: string }[]   // 통과 항목 + 권고 미충족(formatViolation)
  offShort: { name, short: number }[]                        // 목표보다 덜 쉬는 사람 (A3)
  summary: { name, D, E, N, OFF, carryAfter: number, nightBankAfter: int }[]   // settleMonth 투영
  grid: 2-3 격자 행 모양 + 칸별 { requested: boolean, warn: boolean }
}
```

---
phase: 01-inception
stage: 02-domain-model
status: HUMAN_APPROVED
updated: 2026-09-26
---

# [Stage 1-2] Domain Model

## 목적

1-1 컨텍스트를 바탕으로 엔티티·관계·상태 전이·불변식·정산 공식·권한을 정의해, 아키텍처 결정(1-3)과
Construction의 Build Spec이 공유할 도메인 모델을 산출한다.

## 입력 (Inputs)

- 이전 스테이지: [`01-context-synthesis.md`](01-context-synthesis.md) (§3 규칙 분류, §4 명사 후보, §7 질문 해소)
- 요구사항 원문: [`../inputs/requirements_v3.md`](../inputs/requirements_v3.md)
- 디자인 핸드오프: [`../inputs/design-handoff_v1/README.md`](../inputs/design-handoff_v1/README.md) §State Management / Data Model
- 종이 근무표 원본 사진 (실명이 담겨 있어 공개 저장소에서 제외했다. 메인 저장소의 gitignore 폴더 `.local/originals/`에만 로컬 보관한다)

## 체크리스트

- [x] 엔티티·관계(ERD 수준)와 소유 경계 정의
- [x] `ShiftCell.source`(auto/requested/admin)의 결정 규칙과 우선순위
- [x] 잔여치(누적 OFF·잔여 N·연차·특휴) 원장 vs 스냅샷 결정, 월 정산 알고리즘
- [x] 근무표 상태 전이(미생성 → 생성안 n → 확정 → 협의 수정 → 마감)
- [x] 규칙 버전 관리 모델과 "다음 생성부터 적용" 의미
- [x] 권한 매트릭스(특히 코멘트·휴가 사유·증빙 열람)

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

### 0. 이 단계에서 확인한 핵심 사실 — 정산 부호 규약

핸드오프 안에서 누적 OFF의 부호가 서로 충돌한다.

| 출처 | 규약 |
|---|---|
| 핸드오프 README 정산 잡 `offCarry += (기준OFF − 실제OFF)`, S2 설명 "음수면 반납해야 할 오프", 원문 §14 "10번 쉬어야 하는데 8번 → +2" | **양수 = 덜 쉼(더 받아야 함)** |
| 프로토타입 코드 `carryOff + (offN − 10)`, 원문 응급실 지침 §11 "적게 일한 경우 +오프 → 반납", S6 "누적 OFF가 낮을수록 오프 배정 우선" | **양수 = 더 쉼(반납해야 함)** |

**종이 근무표(2026년 10월) 10명 전원을 옮겨 계산해 검증했다.** 기준 OFF를 11일(주말 9 + 10/5 대체공휴일 +
10/9 한글날)로 두고 아래 공식을 적용하면 **10명 모두 종이의 「누적 off」와 일치**한다. 반대 부호 공식은 10명 중
3명만 우연히 맞는다. 옮겨 적은 데이터와 계산: [`evidence/paper-2026-10-settlement-check.py`](evidence/paper-2026-10-settlement-check.py)

```
누적OFF(월말) = 이월OFF + (실제 OFF 칸 수 − 그달 슬리핑오프 수 − 기준 OFF)
슬리핑오프 수 = floor((이월 N + 그달 N 수) / 6),  잔여 N(월말) = (이월 N + 그달 N 수) − 6 × 슬리핑오프 수
```

→ **양수 = 기준보다 더 쉼(다음 달에 반납) · 음수 = 덜 쉼(다음 달에 더 받음)** 으로 확정할 것을 제안한다
(질문 D1). 부수적으로 두 가지를 확인했다.
- **대체공휴일이 기준 OFF에 들어간다**(10/5를 빼면 10명 전원이 1씩 어긋난다). 프로토타입의 `holidays=[3,9]`와
  "기준 10"은 틀린 예시 값이다.
- 종이에서 슬리핑오프는 **그달의 OFF 칸 안에 포함되어** 있고, 칸 모양만으로는 일반 OFF와 구분되지 않는다.
  시스템은 정산을 위해 두 OFF를 구분해 저장해야 한다(§2 `offKind`).

### 1. 엔티티 관계 개요

```
Ward 1─* User 1─* Training(trainee) *─1 User(preceptor)
Ward 1─* RuleVersion (append-only)          Holiday (병원 공통 달력)
Ward 1─* MonthPlan(연월) 1─* ScheduleCandidate(n번째 안) 1─* ShiftCell
                     └─ confirmed → Schedule(확정본) 1─* ShiftCell ─* CellEditLog
User 1─* ShiftRequest(연월·일자)     User 1─* LeaveRequest ─0..1 Attachment
User 1─* BalanceEntry (원장, append-only)  →  Balance (파생 뷰)
MonthPlan 1─* MonthSettlement(인당 정산 결과 스냅샷)
```

### 2. 엔티티 정의

**Ward** `{ id, code:'ER', name:'응급실' }` — 1-1 Q6에 따라 단일 병동으로 시드하되 모든 병동 소속 데이터에 `wardId`를 둔다.

**User**
- `id`, `wardId`, `employeeNo`(**문자열**, 전역 unique, 필수 — 실제 사번 `00101`처럼 앞자리 0 보존), `name`
- `role: 'nurse' | 'admin'` — 권한만 뜻한다.
- `rotation: 'rotating' | 'fixed_weekday'` — 근무 방식. 수간호사는 `fixed_weekday`(평일 D, 빨간 날 OFF). 권한과
  근무 방식을 분리해, 관리자가 교대 근무를 하는 경우도 표현할 수 있게 한다.
- `seniorityRank`(격자 정렬 순서 = 표 순서, 고연차 → 저연차), `seniorityTier: 'senior' | 'mid' | 'junior'`
  (원문 명단의 고/중간/저연차 — 입사일로 자동 계산하지 않고 관리자가 지정. "저연차만 배정 방지" 규칙이 사용)
- `hireDate`(특휴·개원오프 대상 여부, S10 "연차(년)" 표시에 사용), `kTass: boolean`, `unionMember: boolean`(노조교육 대상)
- `nightDedicated?: { from, to }`(야간 전담 기간, 1~6개월 — 토글이 켜진 경우만)
- `active`, `deactivatedAt` — 제거는 소프트 삭제다. 과거 근무표는 보존하고 이후 생성에서만 제외한다.
- 인증: `Credential { userId, passwordHash, mustChangePassword, failedCount, lockedUntil }` — 관리자가 발급·재발급한다(1-1 Q8).
- `onboardedYear?` — S2 초기 설정을 마친 연도. 1월 1일 이후 첫 로그인에서 연차 재입력을 요청하는 기준이다.

**Training** `{ id, traineeId, preceptorId, startDate, endDate(기본 start+3개월), tripleStaffUntil(기본 start+3주, 등록 시 수정 가능) }`
— User 필드가 아니라 별도 엔티티로 둔다. 프리셉터 교체와 이력을 표현할 수 있기 때문이다.

**Holiday** `{ date, name, kind: 'public' | 'substitute' | 'election' | 'labor_day' | 'hospital' | 'union_agreed' | 'founding_day' }`
- `founding_day`를 제외한 모든 종류가 **기준 OFF**와 격자의 빨간 날 음영에 들어간다. 개원기념일은 개인별 "개원오프" 1일로 따로 관리한다(§4).
- 관리자가 편집하며, 공휴일은 초기에 시드한다(소스는 1-3에서 결정).

**RuleVersion** — 핸드오프 `WardRules`를 불변 버전으로 둔다.
`{ wardId, version, params{…핸드오프 WardRules 수치 전부}, toggles{weekendPairOffMonthly, avoidJuniorOnly, minimizeRepeatPairs, nightDedicated}, forbiddenPatterns: string[], changedBy, changedAt, diff[] }`
- 저장할 때마다 새 버전을 추가하고 이전 버전은 수정하지 않는다. 변경 이력 카드(S11)는 `diff`에서 렌더링한다.
- **"다음 듀티 생성부터 적용"의 의미:** 생성안은 생성 시점의 `ruleVersion`을 고정해 기록한다. 확정된 달을
  조정(S9)할 때는 **그 근무표가 고정한 버전**으로 검사하고, 관리자가 원하면 "최신 규칙으로 재검사"를 실행한다.
  신청 마감일·협의 기간 같은 운영 파라미터는 버전과 무관하게 즉시 적용된다.
- 금지 패턴은 문자열 문법 `코드(-코드)+`으로 저장한다(`N-off-D`는 3칸 패턴). 검사기는 패턴 목록을 데이터로 받는다.

**MonthPlan** — 병동의 한 달 근무표 전체 생명주기를 담는다.
`{ wardId, year, month, status, requestDeadline(date), negotiationStart(date), negotiationEnd(date), ruleVersion?, confirmedCandidateId?, confirmedBy?, confirmedAt?, closedAt? }`
- `requestDeadline`·`negotiationStart/End`는 RuleVersion 기본값(전월 15일, 16~20일)으로 채우고, 관리자가 달별로 수정한다(S9 헤더 컨트롤).

**ScheduleCandidate** `{ id, monthPlanId, generationNo(1, 2, 3 …), seed, ruleVersion, createdAt, checkResult }`
— 리롤 이력이다. `seed`와 `ruleVersion`과 입력 스냅샷이 같으면 같은 결과가 나와야 한다(결정적 생성, 1-3 요구).

**ShiftCell** `{ ownerId(candidateId 또는 확정본), userId, date, code, offKind?, leaveKind?, checkupHalf, source, editedBy?, editedAt? }`
- `code: 'D' | 'E' | 'N' | 'S' | 'OFF' | 'AL' | 'LEAVE'` — 격자에 보이는 코드. `AL`=연차("연"), `LEAVE`=경조·병가·공가.
- `offKind`(code=OFF일 때 필수): `'regular' | 'sleeping' | 'edu_cont'(보수교육) | 'edu_union'(노조교육) | 'special'(특휴) | 'founding'(개원오프)`
  — 격자에는 모두 "off"로 보이지만 정산과 잔여치 차감이 달라진다(§4).
- `leaveKind`(code=LEAVE일 때): `'family' | 'sick' | 'official'`
- `checkupHalf: boolean` — 검진 반차 0.5일. 근무 코드는 그대로 두고 표시만 붙인다.
- 빈 칸은 행을 저장하지 않는다(수간호사의 빨간 날 등).

**ShiftRequest** `{ userId, year, month, date, options: ('OFF'|'D'|'E'|'N')[], special?: 'AL' | 'EDU_CONT' | 'EDU_UNION', comment?, updatedAt }`
- (userId, date)당 1건이다. `options`(1~4개, or 조건)와 `special`은 둘 중 하나만 채운다.
- 격자 표기 규칙: `options`가 1개면 칩 색, 2개 이상이면 흰 배경 + 슬래시(`O/D`). `AL`은 "연".

**LeaveRequest** `{ id, userId, type: 'family' | 'sick' | 'official' | 'special' | 'checkup', reasonCode, startDate, endDate, days, attachmentId?, status, decidedBy?, decidedAt?, rejectReason? }`
- `family`는 `reasonCode`로 일수를 고정한다(경조 11종 표). 종료일은 서버에서 계산하며 클라이언트 값은 믿지 않는다.

**BalanceEntry (원장)** `{ id, userId, account, delta, reason, refYear?, refMonth?, refId?, createdBy, createdAt, note? }`
- `account`: `'off_carry' | 'night_bank' | 'annual_leave' | 'special_leave' | 'founding_off' | 'checkup' | 'sick_leave' | 'edu_cont' | 'edu_union'`
- `reason`: `'initial_input' | 'month_settlement' | 'admin_adjust' | 'year_grant' | 'year_reset' | 'leave_approved' | 'leave_cancelled'`
- **스냅샷이 아니라 원장을 택한다.** 근거: ① 관리자 수정·월 정산·휴가 승인이 같은 값을 서로 다른 경로로 바꾸므로
  "누가 언제 왜"가 필요하다. ② 월 마감을 되돌릴 때 반대 항목을 추가하면 되돌리기가 된다. ③ 이월이 연말 없이
  무한히 누적되므로 중간값이 한 번 틀리면 스냅샷으로는 추적할 수 없다.
- **Balance**(파생): `account`별 `delta` 합계. 조회 성능을 위해 캐시 테이블을 둘 수 있지만 SoT는 원장이다.

**MonthSettlement** `{ monthPlanId, userId, baselineOff, actualOff, sleepingOff, nightCount, offCarryBefore, offCarryAfter, nightBankBefore, nightBankAfter, weekendPairAchieved, specialUsed, foundingUsed, checkupUsed, eduCont }`
— 월 마감 시점의 인당 계산 결과다. 종이 양식의 우측 컬럼(누적 off·ⓝN·특휴/개원·검진·보)과 S6 동료 현황,
"전달 주말 통 OFF 미배정 → 이번 달 최우선" 판단이 이 스냅샷을 읽는다.

**CellEditLog** `{ scheduleId, userId, date, before, after, editedBy, editedAt, reason?: 'manual' | 'swap' | 'leave_approved' }`

### 3. 상태 전이

**MonthPlan** (대상 월 M 기준)

```
REQUESTING ──(requestDeadline 경과)──▶ REQUEST_CLOSED ──(첫 생성)──▶ DRAFTING
DRAFTING ──(리롤)──▶ DRAFTING (candidate n+1 추가, 이전 안 보관)
DRAFTING ──(이 안으로 확정)──▶ CONFIRMED  ── 간호사에게 공개, 셀 source 확정
CONFIRMED ──(관리자 조정 · 저장·재배포)──▶ CONFIRMED  (파란 외곽선 + CellEditLog)
CONFIRMED ──(M 종료 후 관리자 "월 마감")──▶ CLOSED  ── MonthSettlement + BalanceEntry 기록
CLOSED ──(관리자 "마감 취소")──▶ CONFIRMED  ── 정산 원장에 반대 항목 추가
```
- 신청 기간은 M−1월 1일부터 `requestDeadline`까지다. 마감 후에는 간호사가 자기 신청을 편집할 수 없고, 관리자는 언제나 편집한다.
- `negotiationStart~End`는 **상태가 아니라 안내 기간**이다(1-1 Q2: 협의는 오프라인, 반영은 관리자). 시스템은 이 기간을 표시만 한다.
- 월 마감을 자동 잡이 아니라 **관리자의 명시적 동작**으로 둔다. 월말 이후에도 당일 결원 교체 같은 조정이 들어오기 때문이다.

**LeaveRequest:** `SUBMITTED → APPROVED | REJECTED`, `SUBMITTED → CANCELLED`(본인), `APPROVED → CANCELLED`(관리자, 셀·원장 복원).
승인하면 해당 기간 셀을 `LEAVE`/`AL`/`OFF(special)`로 바꾸고(`CellEditLog.reason='leave_approved'`) 원장을 차감한 뒤, 인원을 재검사해 부족하면 관리자에게 경고한다.

### 4. 정산·잔여치 규칙

**기준 OFF** `baselineOff(user, M)` = 재직 기간 안에서 M월의 (토·일 ∪ `founding_day`를 제외한 Holiday) 일수.
- 월 중간에 입사하거나 제거된 경우 재직 일수만 센다.
- 수간호사(`fixed_weekday`)는 기준 OFF = 실제 OFF이므로 누적이 0으로 유지된다(종이 "0").

**실제 OFF**(누적 OFF 계산용) = code=OFF 칸 수 − `offKind='sleeping'` 칸 수. 종이 검증식(§0)과 같다.
그 밖의 OFF 종류와 연차·휴가 일을 어떻게 셀지는 질문 D2다. 기본안은 아래와 같다.

| 칸 | 실제 OFF에 포함? | 원장 차감 | 근거 |
|---|---|---|---|
| OFF regular | 포함 | — | 종이 검증 |
| OFF sleeping | **제외** | night_bank −6 | 종이 검증 |
| OFF edu_cont / edu_union | 포함 | edu_cont / edu_union +1(이수 횟수) | 원문 "교육은 OFF로 배정" |
| OFF special / founding | **제외** | special_leave / founding_off −1 | 유급휴가라서 일반 오프를 대체하지 않는다고 봄 |
| AL(연차), LEAVE | 제외(근무일로 봄) | annual_leave −1 / sick_leave −1 | 휴가를 쓰면 오프가 줄어드는 역효과를 막음 |

**잔여 N·슬리핑오프:** `night_bank`에 그달 N 수를 더하고, 실제로 부여된 슬리핑오프 1개마다 6을 뺀다.
원문 §15 "오프를 계속 못 주는 상황이면 바꿔먹을 수 있는 누적 나이트가 계속 지속된다"에 따라,
**부여하지 못한 슬리핑오프는 자동 소멸하지 않고 `night_bank`에 남는다.** 핸드오프의 `nightCarry %= 6`은
"항상 부여한다"는 가정이라 채택하지 않는다. 생성기는 그달 부여 가능 수 `floor((night_bank + 그달 N)/6)`까지
슬리핑오프를 배정하려고 시도한다.

**연 단위 잔여치**
- 연차: 1월 1일에 `year_reset`(잔액을 0으로) 후 본인 재입력(`initial_input`). 관리자가 수정할 수 있다.
- 특별휴가(원문 §6-7, D3 확정): **연 단위**로 `특휴 = min(5, round_half_up(5 × 근무일수 / 365))`.
  - **근무일수 = 그해 재직 일수**(달력 일수)다. 구간 = [max(1/1, 입사일), min(12/31, 제거일)]. 실제 출근일로 보면
    1년 내내 근무해도 250일 안팎이라 원문 최상단 구간 "329~365일 → 5일"에 닿지 못하므로 출근일 해석은 채택하지 않는다.
  - 원문 구간표(1~36→0, 37~109→1, 110~182→2, 183~255→3, 256~328→4, 329~365→5)는 이 산식을 반올림한 결과와 같다.
    구현은 산식으로 하고, **구간표 경계값(36/37, 109/110, 182/183, 255/256, 328/329)을 테스트 케이스로 고정**한다.
    윤년에 366일을 재직해도 상한 5다.
  - 부여 시점(AI 결정): 재직 중인 간호사는 1월 1일에 그해 재직 예정 일수(보통 365 → 5일)로 `year_grant`, 연중 입사자는
    등록 시 입사일부터 12/31까지의 일수로 부여한다. 연중에 제거되면 이미 부여한 분은 회수하지 않는다.
    쓰지 않은 특휴는 12/31에 소멸한다(`year_reset`, "연 단위" 해석).
- 개원오프: 그해 개원기념일(`Holiday.kind='founding_day'`, 관리자 입력)에 재직 중이면 1일 부여, 아니면 "-"(대상 아님 — 1-1 Q5 답변).
- 검진 반차 0.5, 병가 60일, 보수교육 연 1회, 노조교육 연 2회(평일, `unionMember`만): 연 단위 한도다.

**종이 우측 컬럼 매핑:** 누적 off = `offCarryAfter` · ⓝN = `nightBankAfter` · 특휴/개원 = 특별휴가 / 개원오프 ·
검진 = 검진 반차 · 보 = 보수교육 이수 횟수. 특휴·개원·검진 숫자는 **잔여량**이다(D4 확정). 개원오프 대상이 아니면 "-"로 표시한다.

### 5. 셀 출처(source) 결정 규칙

생성기는 칸마다 `auto`/`requested`를 정하고, 관리자 편집은 `admin`으로 덮어쓴다. 우선순위는 **admin > requested > auto**다.

1. 관리자가 확정 후(또는 생성안 위에서) 칸을 바꾸면 → `admin`(파란 외곽선). 바꾼 값이 신청과 같아도 `admin`이다.
2. 아니면, 그 칸의 코드가 해당 날짜 `ShiftRequest`를 만족하면 → `requested`(빨간 외곽선).
   만족 조건: `options`에 배정 코드가 들어 있거나(OFF 옵션은 OFF의 모든 `offKind`를 만족), `special`과 코드가 대응한다
   (`AL`→AL, `EDU_*`→OFF edu_*).
3. 그 외 → `auto`(외곽선 없음).
- 승인된 휴가로 바뀐 칸은 신청을 반영한 것이므로 `requested`로 본다. 연차 칩은 디자인상 외곽선을 그리지 않는다.
- `source`는 확정 시점에 저장한다. 확정 후 신청을 수정해도 `source`는 바뀌지 않는다(마감 후 신청은 잠기므로 실제로는 생기지 않음).

### 6. 불변식 (저장 계층에서 강제)

1. `User.employeeNo`는 비어 있을 수 없고 전역에서 유일하다. 제거된 사용자의 사번도 재사용하지 않는다.
2. `ShiftCell`은 (소유자, userId, date)당 최대 1개다. `code=OFF`이면 `offKind`가, `code=LEAVE`이면 `leaveKind`가 반드시 있다.
3. `ShiftRequest`는 `options`와 `special` 중 정확히 하나만 채운다. `EDU_UNION`은 `unionMember`만 신청할 수 있다.
4. `MonthPlan`당 `CONFIRMED` 확정본은 1개다. `CLOSED` 달의 셀은 "마감 취소" 없이 수정할 수 없다.
5. `RuleVersion`과 `BalanceEntry`와 `CellEditLog`는 추가만 한다(수정·삭제 금지).
6. `LeaveRequest.days`와 `endDate`는 서버가 계산한다. 병가 연 60일, 특휴·검진 잔여를 넘는 신청은 저장하지 않는다.

### 7. 인원 계산 규칙 (검사기와 생성기가 공유)

날짜 d, 듀티 s(D/E/N)에 대해:
- **집계 대상:** `rotation='rotating'`이고 재직 중인 간호사. 수간호사는 제외한다(1-1 Q3).
- **트레이닝:** `tripleStaffUntil` 이전의 신규 간호사는 인원에 **세지 않는다** → 그 듀티는 신규 외에 최소 인원(2)을
  채워야 하므로 실제로 3인이 된다. 3주 이후 트레이닝 종료까지는 정상 인원으로 센다. 트레이닝 기간 내내 신규의 근무 코드는
  프리셉터와 같아야 한다(하드 제약). K-tass 인원에는 신규를 세지 않는다.
- **K-tass:** 집계 대상 중 `kTass=true`가 `minKTass` 이상이어야 한다.
- **저연차만 방지:** 집계 대상 전원이 `junior`이면 권고 위반이다.

### 8. 권한 매트릭스

| 자원 · 동작 | 간호사 | 관리자 |
|---|---|---|
| 확정 근무표·전원 누적 OFF·잔여 N 조회 | ✅ | ✅ |
| 생성안(DRAFTING) 조회 | ❌ | ✅ |
| 다음 달 전원 신청 조회 | ✅ (옵션·`hasComment`만) | ✅ (코멘트 포함) |
| 신청 코멘트 본문 | 본인 것만 | ✅ |
| 내 신청 작성·수정 | 마감 전까지 | 언제나(누구의 것이든) |
| 휴가 신청 | 본인 | 본인 + 승인·반려 |
| 휴가 사유·증빙 파일 | 본인 것만 | ✅ |
| 동료의 휴가 | 격자의 코드("연"·휴가)만 | ✅ |
| 규칙·공휴일·간호사·잔여치 수정, 월 마감 | ❌ | ✅ |

- 코멘트는 **응답 DTO를 역할별로 따로 만들어** 서버가 걸러 낸다. 클라이언트에서 숨기는 방식은 쓰지 않는다.

### 9. 1-3으로 넘기는 설계 요구

- 규칙 검사기는 `(셀 격자, 사용자 속성, RuleVersion, Holiday, 전월 말 3일 셀, 신청)` → `{ hardViolations[], softWarnings[] }`
  를 반환하는 **순수 함수**여야 한다. 월 경계 패턴(9/30 E → 10/1 D)을 잡으려면 **전월 마지막 며칠**이 입력에 들어가야 한다.
- 생성기는 같은 입력 + 같은 `seed`로 같은 결과를 내야 한다.
- 원장 기반 잔액 조회는 11명 규모에서 성능 문제가 없다. 캐시는 필요해질 때 추가한다.

### 10. 질문과 답변 (2026-09-26 전부 해소)

| # | 질문 | 확정 |
|---|---|---|
| D1 | 누적 OFF 부호: 종이 검증대로 **양수 = 더 쉼(반납) · 음수 = 덜 쉼(더 받음)** 으로 확정하나요? 그러면 S2 설명 문구("음수면 반납")와 S3 요약 카드 색(양수 초록)을 고쳐야 합니다 | ✅ 종이 규약으로 확정. S2 문구는 "양수면 반납할 오프, 음수면 더 받을 오프"로 바꾼다(편차 기록 대상) |
| D2 | 특휴·개원오프·연차·휴가 일이 누적 OFF 계산의 "실제 OFF"에 들어가나요? | ✅ §4 표대로 확정 |
| D3 | 특별휴가 산정 기준(근무일수를 세는 기간, 부여 시점)과 개원기념일 날짜·개원오프 대상 기준 | ✅ 원문 §6-7: 해당 연도 재직 일수 기준 산식(§4). 최초 기본안 "직전 1년"은 원문과 달라 폐기. 개원오프는 기본안대로 |
| D4 | 종이의 특휴/개원·검진 숫자는 사용량인가요, 잔여량인가요? | ✅ 잔여량 |
| D5 | 종이의 노란 이름 표시(K-tass 권한자)를 격자에 재현하나요? | ✅ 격자에 재현하지 않음. 간호사 관리 화면에서만 표시 |

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] 도메인 모델이 핸드오프 화면·규칙을 빠짐없이 지원하는가?
- [ ] 정산 공식(§0, §4)이 종이 근무표 운영과 일치하는가?
- [x] 미해결 질문 D1~D5에 답했는가? (2026-09-26 전부 해소)

## 다음 단계

승인 후 → `STATUS.md`의 1-2를 `HUMAN_APPROVED`로 업데이트 → `03-architecture-decision.md`로 이동

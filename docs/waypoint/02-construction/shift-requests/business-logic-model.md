---
artifact: business-logic-model
build-spec: shift-requests
status: DRAFT
updated: 2026-09-27
---

# Business Logic Model — 2-5 근무 신청·휴가

## 1. 워크플로

### 화면 열기 `/requests?ym=`
1. `requireUser` → 대상 월(기본 오늘의 다음 달) → `ensureRequestPlan(db, ym, today, rules)`(R-REQ-PLAN-1·2)
2. `loadRequests(db, ym, viewer)` → 신청·휴가·사용자·잔여 → `toNurseRequestsDTO` 또는 `toAdminRequestsDTO`
3. 클라이언트 `RequestsScreen`에 DTO 전달. 30초·포커스마다 `router.refresh()`

### 근무 신청 저장 (팝오버)
`saveShiftRequestAction({ userId, date, options | special, comment })` → 권한(R-REQ-EDIT-1·2) → 검증(R-REQ-SHIFT-1~3) → upsert(`submitted_at` = 관리자면 now, 아니면 null) → `refresh()`

### 휴가 저장
`saveLeaveAction({ userId, type, reasonCode?, startDate, endDate?, comment })` → 권한 → 종료일·일수 계산 → 겹침(R-LEAVE-4) → 예정 잔여(R-LEAVE-5) → insert(DRAFT, 관리자면 SUBMITTED)

### 제출
`submitRequestsAction(ym)` → 본인 → R-REQ-EDIT-1 → 그달 임시 근무 신청 `submitted_at = now`, 그달 시작 휴가 `DRAFT → SUBMITTED`

### 승인·반려
`decideLeaveAction(id, 'approve' | 'reject', reason?)` → 관리자 → `SUBMITTED`만 → status·decidedBy·decidedAt·rejectReason.
확정된 달이면 같은 트랜잭션에서 R-APPROVE-2 칸 대체 + `CellEditLog`.

### 인원 영향 (확정된 달, 패널 카드마다)
```
leaveImpact(db, leave):
  plan = 휴가 시작 달의 확정 계획; input = 2-7과 같은 ScheduleInput 조립(칸·전월 꼬리·신청·트레이닝·잔여)
  before = checkSchedule(input).hardViolations
  after  = checkSchedule(input with 휴가 칸 적용).hardViolations
  new = after − before (ruleId·dates·shift·userIds 기준), 휴가 기간 날짜에 닿는 것만
  return new.map(formatViolation)
```

## 2. 알고리즘

```
projectedLeaveBalance(db, userId, today):
  base = loadLeaveBalance(db, { viewerId: userId, today })      // 2-3: 오늘 달 월말 예정
  pending = leave_requests(userId, status ∈ {DRAFT, SUBMITTED, APPROVED}) 중 확정·마감 계획이 없는 달에 걸친 것
  for each: base[account(type)] −= days
  return base                                                     // 사이드바 카드도 이 값을 쓴다

offTarget: domain offTarget(baselineOff(M), 월초 누적 OFF, 월초 잔여 N, sleepingOffPerN)
  월초 값 = 2-3 monthStart(M) (앞선 확정·미마감 달 투영 포함)
```

## 3. 상태 전이

| 대상 | 현재 | 이벤트 | 다음 |
|---|---|---|---|
| MonthPlan | 없음 | 신청 기간 안에 화면 열기 | REQUESTING |
| MonthPlan | REQUESTING | 오늘 > 마감 | REQUEST_CLOSED |
| ShiftRequest | 임시 | 제출 | 제출 |
| ShiftRequest | 제출 | 수정 | 임시 |
| LeaveRequest | DRAFT | 제출 | SUBMITTED |
| LeaveRequest | SUBMITTED | 승인 / 반려 / 본인 취소 | APPROVED / REJECTED / CANCELLED |
| LeaveRequest | APPROVED | 관리자 취소(생성 전) | CANCELLED |

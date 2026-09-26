---
artifact: business-logic-model
build-spec: schedule-view
status: IMPLEMENTED
updated: 2026-09-27
---

# Business Logic Model — 2-3 근무표 조회

## 1. 워크플로 — `/` 요청

1. `page.tsx`(서버): `requireUser()` → `parseYm(searchParams.ym, todaySeoul())`
2. `loadMonthView(db, { year, month, viewerId, today })` → `MonthViewData`
3. `buildScheduleView(data)` → `ScheduleView`(순수)
4. 컴포넌트 렌더링. 클라이언트 JS는 인쇄 버튼뿐이다.

## 2. 알고리즘

### 2.1 원장 합계 (`balances.ts`)

```
ledgerSums(db, userIds, { asOf? }) → Map<userId, Record<BalanceAccount, number>>
  SELECT user_id, account, SUM(delta) FROM balance_entries
   WHERE user_id IN (...) [AND created_at <= asOf] GROUP BY user_id, account
eduContInYear(db, userIds, year, asOf?) = SUM(delta) WHERE account = 'edu_cont' AND ref_year = year [AND created_at <= asOf]
```

### 2.2 월초·월말 잔여 (R-VIEW-12·13)

```
rowBalances(db, { year, month, plan, users, holidays, rules }):
  if plan.status == CLOSED:
    snap = month_settlements(plan)                        // 사용자별
    asOf = plan.closedAt
    sums = ledgerSums(asOf)
    return per user: before/after = snap, remaining = sums, edu = eduContInYear(year, asOf)

  // 확정·미마감: 원장 현재 합계에서 출발해 앞선 확정·미마감 달을 차례로 투영
  sums = ledgerSums()                                     // 현재
  edu  = eduContInYear(year)
  earlier = month_plans WHERE status = CONFIRMED AND (year, month) < 보는 달 ORDER BY year, month
  for p in earlier:
    cells(p) → 사용자별 settleMonth({ nurse: profile(sums), …, holidays(p) })
    sums += entries;  if p.year == year: edu += eduCont
  profile(sums) = NurseProfile{ offCarryBefore: sums.off_carry, nightBankBefore: sums.night_bank, … }
  s = settleMonth(보는 달)
  return per user: before = profile, after = s, remaining = sums + s.entries, edu = edu + s.eduCont
```

- `settleMonth`의 `nurse`는 `users` 행과 재직 기간으로 만든다(`employedUntil` = `deactivatedAt` 서울 날짜 전날).
- `nextHead`(달을 걸친 주말)는 다음 달 확정본의 1일 칸으로 넣는다(주말 달성 여부는 S3에 표시하지 않지만 정산 결과를 일관되게 유지).

### 2.3 뷰 모델 (`view.ts`)

```
buildScheduleView(d):
  days = monthDates(y, m).map(date → { red: isRedDay(date, redDaySet(holidays)), color: sun|sat|plain })
  if d.plan?.status ∉ {CONFIRMED, CLOSED}: return { …, empty, rows: [] }
  rows = order(users)                                       // R-VIEW-2
    → cells: days.map(date → cellView(cellAt(user, date), red))  // R-VIEW-5~7
    → 우측 컬럼: balances(user)                             // R-VIEW-9·10
  cards = viewer 행이 있으면 build(viewer)                   // R-VIEW-11·14
  footer = R-VIEW-17
```

`cellView(c)`:
```
label = c ? { D,E,N,S → 코드, OFF → 'off', AL|LEAVE → '휴' } : ''
chip  = c ? { D→d, E→e, N→n, S→s, OFF→off, AL|LEAVE→leave } : null
outline = !c || c.code ∈ {AL, LEAVE} ? null : c.source == admin ? 'admin' : c.source == requested ? 'requested' : null
title = [M/D (요일), label, 종류(offKind·leaveKind 한글), 검진 반차?, 신청 반영|관리자 수정].join(' · ')
```

종류 한글: regular 없음 · sleeping "슬리핑오프" · edu_cont "보수교육" · edu_union "노조교육" · special "특별휴가" · founding "개원오프" · family "경조휴가" · sick "병가" · official "공가".

### 2.4 사이드바 잔여 (`balances.ts` `leaveBalanceSummary`)
```
today의 달 (y, m)에 대해 rowBalances(viewer만)를 계산 → 월말(확정이면) 또는 월초(확정 전) 잔여
granted(account) = SUM(delta) WHERE delta > 0 AND account IN (annual_leave, special_leave) AND created_at의 서울 연도 = y
```
AppShell(layout)에서 요청마다 한 번 계산한다(사용자 1명, 쿼리 3~4개).

## 3. 상태 전이

N/A — 조회만 한다.

## 4. 시퀀스 — 개발 시드 (`dev-schedule.ts`)

1. `fixtures/paper-2026-10.json`(가명)을 읽는다. 없으면 건너뛴다.
2. 2026-10 MonthPlan이 이미 있으면 건너뛴다(멱등).
3. 사용자별 초기 원장(`initial_input`, `created_at` = 2026-09-30): `off_carry` = 이월 off, `night_bank` = 이월 N, `annual_leave` 15, `special_leave` 5, `checkup` 0.5, `sick_leave` 60.
4. MonthPlan(2026-10, CONFIRMED, `defaultPlanDates`, 규칙 v1, 확정자 = 관리자) + `schedule_cells` 330개. 슬리핑오프는 `floor((이월N + 그달N)/6)`개를 앞쪽 OFF부터, `source`는 모두 `auto`.

## 5. 통합 지점

N/A — 외부 호출 없음.

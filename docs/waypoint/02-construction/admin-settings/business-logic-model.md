---
artifact: business-logic-model
build-spec: admin-settings
status: DRAFT
updated: 2026-09-27
---

# Business Logic Model — 2-4 관리자 설정

## 1. 워크플로

### 간호사 추가
1. 폼 제출 → `createStaffAction`(requireAdmin, zod) → `createStaff(db, input, { adminId, today })`
2. 트랜잭션: 사번 중복 검사 → users(rank = max + 1) → credentials(임시 비밀번호 해시) → 초기 원장·자동 부여 → 트레이닝
3. 결과 `{ ok: true, tempPassword, name, employeeNo }` → 클라이언트가 모달로 한 번 보여 준다(닫으면 다시 볼 수 없음)
4. `revalidatePath('/admin/staff')`, `revalidatePath('/')`

### 규칙 저장
1. 폼 상태(클라이언트) → `saveRulesAction(input)` → `validateRuleSet` → 최신 버전 조회 → baseVersion 비교 → diff 계산 → insert v+1
2. `revalidatePath('/admin/rules')`, `/`(하단 문구), `/login`(마감일 문구)

### 공휴일 가져오기
1. 버튼(연도) → `importHolidaysAction(year)` → `fetchRestDays(year, key, fetchImpl)` → `upsertHolidays` → `reconcileFoundingOff(year)`
2. 결과 요약 문구

## 2. 알고리즘

```
roleLabel(u, trainingsToday):
  if u.rotation == fixed_weekday || u.role == admin → '수간호사 · 관리자'
  if trainingsToday.some(t => t.traineeId == u.id) → '신규'
  if trainingsToday.some(t => t.preceptorId == u.id) → '프리셉터'
  → '간호사'

years(hireDate, today) = hireDate ? 만 나이 계산(월·일 비교) : null

diffRules(before, after) = 모든 params·toggles 키에서 값이 다른 것 + forbiddenPatterns(정렬 후 비교, 다르면 key 'forbiddenPatterns')

classifyHoliday(name) = /대체/ → substitute | /선거/ → election | /노동절|근로자/ → labor_day | public

ensureYearStart(db, today):
  y = year(today)
  if exists(balance_entries where reason = year_reset and ref_year = y) → return 'done'
  dec = month_plans(y-1, 12); if dec?.status == CONFIRMED → return 'deferred'
  tx: pg_advisory_xact_lock(hash('year-start', y)); 다시 존재 검사
      for u in active users:
        sums = ledgerSums(u)
        for a in [annual_leave, special_leave, founding_off, checkup, sick_leave]: if sums[a] != 0 → insert year_reset(−sums[a])
        insert year_grant special_leave specialLeaveDays(employedDaysInYear(y, u.hireDate, null)), checkup 0.5, sick_leave 60
      reconcileFoundingOff(tx, y)
  (활성 사용자가 없으면 year_reset이 생기지 않으므로 다음 요청에서 다시 검사한다)
  return 'started'

reconcileFoundingOff(tx, y):
  day = holidays where kind = founding_day and year = y
  for u in active users:
    target = day && isEmployed(u, day) ? 1 : 0
    have = SUM(founding_off, reason = year_grant, ref_year = y)
    if target != have → insert year_grant(target − have)
```

## 3. 시퀀스 — 연초 처리 트리거

`(app)/layout.tsx`: `requireUser` → `ensureYearStart(getDb(), appToday())`(결과 무시, 실패해도 화면은 계속) → `loadLeaveBalance`.

## 4. 통합 지점

| 대상 | 호출 | 실패 처리 |
|---|---|---|
| 공공데이터 특일 정보 `getRestDeInfo` | 관리자 버튼 | 키 없음 → 버튼 비활성·안내 / 5초 타임아웃·HTTP 오류·`resultCode != '00'` → 쓰지 않고 오류 문구. 응답 `items.item`이 객체 하나일 때도 배열로 처리 |

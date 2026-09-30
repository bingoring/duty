# business-logic-model — 2-7 근무 조정·월 마감

## §1. 칸 편집 (브라우저, 즉시 검사)

```
셀 클릭 → CellPopover(userId, date)
  base  = checkInput.cells 에 저장 전 편집안 적용(applyEdits)
  칩 선택 c → trial = applyEdits(base, [edit(c)])
  diff  = newViolations(checkSchedule(base), checkSchedule(trial))   // R-ADJ-4
  hard 있으면 [적용] 비활성, [그래도 적용] + 사유 입력 → override
  인원 경고: diff 중 H-STAFF/H-KTASS/S-HEAD-FILL 이 있으면 replacementCandidates(trial, date, shift) 상위 1명으로
             "강도윤 (OFF, K-tass)" + [강도윤과 맞바꾸기] (맞바꾸기 = 두 칸 교환 편집 2개)
  [적용] → edits 목록에 넣음 → 헤더 "변경 N건 미저장", 칸에 파란 점선(미저장 표시)
[되돌리기] → edits 비움   [저장 · 재배포] → saveEditsAction(edits)
```
검사 입력(`checkInput`)은 서버가 월초 잔여를 채워 준다(2-6 `fillProfiles`와 같은 함수) — H-BALANCE·H-SLEEPING·S-SHIFT-BALANCE가 서버와 같게 판정된다.

## §2. 저장 · 재배포 (`saveEdits(db, actor, planId, edits)`)

```
1. adminOnly · plan CONFIRMED (R-ADJ-2)
2. 현재 칸 로드 → 편집마다 before 비교, 다르면 충돌 목록으로 거부 (R-ADJ-7)
3. input = 검사 입력(월초 잔여 채움), before = checkSchedule(input), after = checkSchedule(applyEdits(input, edits))
   uncovered = uncoveredViolations(newViolations(before, after), edits)  → 있으면 거부 (R-ADJ-6)
4. tx: 칸 갱신(source admin) + cell_edit_logs(편집마다, note = override 사유)
5. refresh()
```

## §3. 대체 지정 (4a → S9, R-LEAVE-C1·R-ADJ-10)

```
4a [승인 · 대체 지정] → decideLeaveAction(approve) → 성공 & impact 있음
   → router.push(/adjust?ym=2026-10&focus=2026-10-14&shift=E)
S9: focus가 있으면 그 날짜 열을 강조하고 ReplacementPopover:
   "10/14 (수) E 인원 1명 · 최소 2명" + 후보 목록(replacementCandidates) — [지정] = 후보 칸을 OFF → E 편집(kind replacement)
   → 일반 편집과 같이 모였다가 저장
```

## §4. 월 마감 (`server/adjust/close.ts`)

```
previewClose(db, plan)  → settleAll(plan, cells, monthStart sums)   // 2-3 load.ts의 계산을 그대로 export해서 쓴다
closeMonth(db, actor, planId, today)
  tx: FOR UPDATE plan → R-CLOSE-1 재확인 → 결과 계산(미리보기와 같은 함수)
      → insert month_settlements, insert balance_entries(reason month_settlement, refYear/refMonth/refId)
      → update plan CLOSED, closedBy, closedAt
reopenMonth(db, actor, planId)
  tx: FOR UPDATE → 뒤 달 CLOSED 아님·(12월이면) 연초 처리 전 확인
      → 이 plan의 month_settlement 항목 조회 → reverseEntries → insert(reason settlement_reversed)
      → delete month_settlements → update plan CONFIRMED, closedBy/At null
```
마감 뒤 조회(2-3)는 스냅샷·원장을 읽으므로 추가 작업이 없다(R-VIEW-13).

## §5. 승인 휴가 취소 (`cancelApprovedLeave`)

```
adminOnly · leave APPROVED · 그 달 plan CONFIRMED (CLOSED면 거부)
tx: 날짜마다 domain-entities §3 복원 → leave CANCELLED
결과: { ok, restored: IsoDate[], skipped: { date, reason }[], warnings: string[] (복원 뒤 새 필수 위반 문구) }
```

## §6. 안내 (`server/notices`)

```
loadNotices(db, viewerId) → cell_edit_logs ⋈ users(editedBy) where userId = viewer, editedBy ≠ viewer, editedAt > seenAt(없으면 now − 14일)
  → 칸별 최신으로 합침 → 최대 5 + 나머지 수
ackNoticesAction() → sessionActor → users.changes_seen_at = now()
근무표 page.tsx가 loadNotices 결과를 NoticeBar에 넘긴다(관리자 자신에게도 남이 바꾼 칸이면 보임).
```

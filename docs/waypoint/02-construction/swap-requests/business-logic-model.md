# business-logic-model — 2-8 근무 교환 요청

## §1. 요청 만들기 (브라우저)

```
「근무 조정」 누름 → 선택 모드: 체크 열로 사람 선택(나는 자동 포함, 수간호사 행 없음)
날짜 열 헤더 또는 선택한 사람의 칸 클릭 → SwapPopup(date, 선택한 사람들)
  after = before 복사, 변경 후 칩 A 클릭(선택) → 칩 B 클릭 → A·B 값 교환 (sameCounts는 항상 참)
  바꿀 수 없는 칸(휴가 등)이 있으면 그 사람 줄은 흐리게 + "휴가 칸은 바꿀 수 없습니다", 요청 버튼 비활성
  검사: newViolations(checkSchedule(input), checkSchedule(applyEdits(input.cells, swapToEdits(...))))
    필수 위반 → 빨간 박스 + 요청 버튼 비활성, 없음 → 초록 "규칙 검사 통과 · 인원 D2/E2/N2 유지 · …"
  겹침 경고(pendingByCell), 코멘트, "오민지 · 강도윤에게 요청됩니다", [취소] [요청 보내기]
```

## §2. 서버 (`server/swaps/service.ts`)

```
createSwap(db, actor, { planId, date, items, comment }, today)   R-SWAP-1~6 → insert request + items(요청자 ACCEPTED, 나머지 PENDING)
respondSwap(db, actor, id, 'accept'|'reject', today)             R-SWAP-7, 전원 수락이면 applySwap (R-SWAP-8·9)
cancelSwap(db, actor, id)                                         R-SWAP-10
expireSwaps(db, planId, today)                                    조회 때 호출
invalidateSwapsForCells(tx, planId, cells[], reason)              2-7 saveEdits·decideLeave·cancelApprovedLeave 트랜잭션 안에서 호출
```
applySwap은 2-7 저장과 같은 방식으로 칸을 바꾼다(검사 입력 = `adjustCheckInput`).

## §3. 화면 연결

- `/adjust` 간호사: 3a(NurseAdjust). 관리자: 2-7 도크 화면 + 우측에 교환 요청 현황 패널(읽기 전용, 접기).
- 근무표 `/`: NoticeBar에 "받은 교환 요청 N건 → 근무 조정" 줄.
- 사이드바 「근무 조정」 메뉴에 받은 대기 요청 수 배지(#C8321E).
- 30초·포커스 새로고침(2-5 방식)으로 상대의 수락·거절을 반영한다.

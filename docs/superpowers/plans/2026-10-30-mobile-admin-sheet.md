# 3-12 모바일 대응 3차 (바텀 시트 다듬기 + 관리 탭: 휴가 승인·급한 변경) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 바텀 시트를 네이티브 앱처럼(스르륵 올라오고 내려가며, 손잡이를 끌어내리면 닫힘) 만들고, 관리자가 휴대폰에서 휴가 승인과 확정된 근무표의 급한 변경을 하게 한다.

**Architecture:** `BottomSheet`를 `open` prop으로 제어하는 컴포넌트로 바꿔 닫힐 때도 내용을 그린 채 내려가게 하고, 손잡이 끌기·초점·스크롤 잠금을 넣는다. 급한 변경은 **데스크톱 도크의 `CellBody`·`ReplacementBody`를 시트 안에 재사용**하고(겉틀만 `variant`), 데스크톱 `AdjustScreen`의 편집 상태(편집·휴가·되돌리기·저장)는 `useAdjustDraft` 훅으로 꺼내 둘이 같이 쓴다. 관리자 근무 조정 데이터는 홈에서 미리 읽지 않고 시트를 열 때 서버 액션으로 읽는다. 휴대폰 휴가 넣기는 부분 리롤 없이 그 칸만 휴가로 바꾸고 인원 부족은 대체 지정·사유로 해결한다.

**Tech Stack:** Next.js 16(코드 전 `apps/web/node_modules/next/dist/docs` 확인), React 19, Tailwind v4, Vitest, Playwright `mobile`(Pixel 7). 새 라이브러리는 넣지 않는다.

**Spec:** `waypoint/projects/duty/03-operations/12-mobile.md` §3 관리 (시안 `inputs/design-mobile/5-admin.html`). 1·2차 계획 `docs/superpowers/plans/2026-10-29-mobile-*.md`.

## Global Constraints

- 시트 애니메이션: 열기·닫기 `transform: translateY` 전환 **280ms `cubic-bezier(0.32, 0.72, 0, 1)`**, 배경 `opacity` 0 ↔ 0.35 같은 시간. `prefers-reduced-motion: reduce`면 전환 없음.
- 손잡이 끌기: 손잡이 줄(높이 28px, 폭 전체, `touch-action: none`)을 아래로 끌면 시트가 손가락을 따라오고, 놓을 때 **끈 거리 > min(120px, 시트 높이의 25%) 또는 속도 > 0.6px/ms**면 닫고 아니면 제자리로. 위로 끌면 움직이지 않는다.
- 데스크톱 화면·데스크톱 E2E는 수정 없이 통과(`AdjustScreen` 리팩터 포함).
- 서버 저장 규칙은 그대로: 급한 변경 저장 = 기존 `saveEditsAction`(필수 위반은 대체 지정 또는 사유(`override`)가 있어야 저장), 휴가 승인 = 기존 `decideLeaveAction`, 승인 취소 = 기존 액션.
- 휴대폰 휴가 넣기 = **그 칸(하루)만**, 부분 리롤 없음(사용자 결정 2026-10-29).
- 간호사 관리자: 관리 탭(`/manage`) = 휴가 승인 + 처리 이력. 급한 변경 = 근무표 「전체」에서 이름 누르기. 의사 관리자: 관리 탭 = 「근무 바꾸기」 링크 → `/doctor/adjust`(휴대폰은 한 열 + 도크를 시트로).
- 실명 금지, 커밋 트레일러 없음, 실명 검사 0건, **포맷 검사는 `.superpowers/`로 시작하는 경로만 빼고 본다**(2차 CI 실패 교훈).
- E2E는 다른 스펙이 바꾼 DB 상태(신청 마감·확정 여부)에 기대지 않게 쓴다(2차 main CI 실패 교훈).

## Review Focus

- 시트 안 입력칸(코멘트·사유)에 글을 쓰다가 손잡이가 아닌 곳을 끌어도 시트가 닫히지 않는다.
- 시트를 닫는 모든 길(배경 탭, Escape, 닫기·취소 버튼, 저장 성공, 끌기)에서 내려가는 애니메이션이 나오고, 다 내려간 뒤 한 번만 `onClose`가 불린다.
- 급한 변경 시트에서 저장하지 않고 닫으면 편집이 버려진다(데스크톱의 「저장 전 변경 n건」 경고처럼 확인을 묻는다).
- 관리자가 확정되지 않은 달(신청 중·생성안)의 「전체」에서 이름을 눌러도 편집 시트가 열리지 않는다(데스크톱 `editBlockReason`과 같게 안내).
- 휴가 승인 뒤 인원이 모자라면 PC 격자(`/adjust`)가 아니라 근무표 「전체」의 그 날짜·근무 대체 지정 시트가 열린다.

---

### Task 1: 바텀 시트 v2 (애니메이션·손잡이 끌기·초점·스크롤 잠금)

**Files:**

- Create: `apps/web/src/components/mobile/sheet-drag.ts`, `sheet-drag.test.ts`
- Modify: `apps/web/src/components/mobile/BottomSheet.tsx`, `MobileRequests.tsx`, `MobileSwap.tsx`, `apps/web/src/components/doctor/DoctorRequestsScreen.tsx`, `apps/web/src/components/requests/RequestPopover.tsx`(`Shell`), `apps/web/src/components/adjust/NurseAdjust.tsx`(`SwapPopup`)

**Interfaces:**

- Produces:
  - `export function dragOutcome(a: { dy: number; velocity: number; height: number }): 'close' | 'stay'` (전역 제약의 기준값)
  - `export function dragOffset(dy: number): number` — 아래로는 그대로, 위로(음수)는 0
  - `BottomSheet({ open: boolean; label: string; onClose: () => void; children: React.ReactNode })` — `open`이 false가 되어도 마지막 children을 그린 채 내려간 뒤 언마운트. 닫는 길(배경·Escape·끌기)은 `onClose`를 부르고, 부모가 `open=false`로 바꾸면 내려간다. 열려 있는 동안: 시트에 초점(`tabIndex=-1`), Tab 순환, 닫힌 뒤 원래 초점 복원, `body`를 `position: fixed; top: -scrollY`로 잠그고 복원. 시트 안에서 이미 `preventDefault`된 Escape는 무시.
  - `RequestPopover`의 `Shell`·`SwapPopup`은 `variant === 'sheet'`면 `role="group"`(시트가 이미 dialog), Escape 처리 때 `e.preventDefault()`.
- 호출부는 `{x && <BottomSheet …>}` 대신 `<BottomSheet open={!!x} …>`(내용은 x가 있을 때만 계산되므로 `x &&`는 children 안쪽으로).

- [ ] **Step 1: 실패하는 테스트** (`sheet-drag.test.ts`)

```ts
it('짧게 끌면 제자리', () => expect(dragOutcome({ dy: 40, velocity: 0.2, height: 600 })).toBe('stay'))
it('120px 넘게 끌면 닫힘(높은 시트)', () =>
  expect(dragOutcome({ dy: 130, velocity: 0.1, height: 600 })).toBe('close'))
it('낮은 시트는 높이 25%만 넘어도 닫힘', () =>
  expect(dragOutcome({ dy: 70, velocity: 0.1, height: 240 })).toBe('close'))
it('빠르게 튕기면 짧아도 닫힘', () =>
  expect(dragOutcome({ dy: 30, velocity: 0.8, height: 600 })).toBe('close'))
it('위로는 움직이지 않음', () => {
  expect(dragOffset(-50)).toBe(0)
  expect(dragOffset(35)).toBe(35)
})
```

- [ ] **Step 2:** `vitest run src/components/mobile/sheet-drag.test.ts` → FAIL
- [ ] **Step 3:** 구현. `BottomSheet`: 상태 `phase: 'enter' | 'open' | 'leave' | 'closed'`, `open` 변화로 전환, `transitionend`(대비 320ms 타이머)에서 `closed`로. 손잡이 `onPointerDown/Move/Up`(`setPointerCapture`), 이동 중에는 전환을 끄고 `translateY(dragOffset(dy))`, 배경 투명도도 비례. 속도는 마지막 이동 두 점으로.
- [ ] **Step 4:** 단위 PASS, `typecheck`·`lint`, 2차 모바일 E2E(`e2e/mobile/requests-swap.spec.ts`) PASS(시트 닫힘은 `toBeHidden`이 애니메이션을 기다린다)
- [ ] **Step 5: E2E 추가** (`e2e/mobile/sheet.spec.ts`): 신청 시트를 열고 손잡이(`getByRole('button', { name: '끌어서 닫기' })`, 손잡이에 이 이름) 를 마우스로 200px 끌어내리면 시트가 사라진다 / 40px만 끌면 남아 있다 / 시트 안 코멘트 입력칸을 끌어도 남아 있다. 신청 가능 여부와 무관하게 시트를 여는 날짜·화면을 쓴다(`/requests?ym=2026-12`처럼 신청 기간이 아닌 달도 시트는 열림).
- [ ] **Step 6:** 커밋 `feat(web): 바텀 시트 — 올라오고 내려가는 애니메이션, 손잡이 끌어 닫기, 초점·스크롤 잠금`

---

### Task 2: 휴가 승인 데이터 분리와 관리 탭 배지

**Files:**

- Create: `apps/web/src/server/requests/approvals.ts`
- Modify: `apps/web/src/server/requests/load.ts`(관리자 pending/history를 새 함수로), `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/components/shell/AppShell.tsx`, `MobileShell.tsx`, `BottomTabs.tsx`, `mobile-tabs.ts`(+test)
- Test: `apps/web/src/server/requests/approvals.int.test.ts`(기존 int 테스트 방식)

**Interfaces:**

- Produces:
  - `export async function loadLeaveApprovals(db: Db): Promise<{ pending: PendingLeave[]; history: LeaveHistory[] }>` — 지금 `loadRequestsRaw` 안의 관리자 블록을 그대로 옮김(`loadRequestsRaw`는 이것을 부른다)
  - `export async function pendingLeaveCount(db: Db): Promise<number>` — `SUBMITTED` 수만(달력 읽지 않음)
  - `MobileTab.badge`에 `'approval'` 추가, 관리 탭 = `'approval'`(간호사 관리자만). `AppShell` prop `approvalCount?: number`.
- [ ] **Step 1: 실패하는 테스트** — int: 제출된 휴가 2건·승인 1건 시드 → `pendingLeaveCount` = 2, `loadLeaveApprovals().pending.length` = 2, `history`에 승인 1건. 단위: `mobileTabs('nurse', true).find(t => t.label === '관리')?.badge === 'approval'`.
- [ ] **Step 2:** FAIL 확인 → **Step 3:** 구현(간호사 레이아웃은 관리자일 때만 `pendingLeaveCount`) → **Step 4:** int·단위 PASS, 데스크톱 `e2e/requests.spec.ts` PASS
- [ ] **Step 5:** 커밋 `feat(web): 휴가 승인 목록 분리, 모바일 관리 탭 배지`

---

### Task 3: 관리 탭 휴가 승인 화면

**Files:**

- Modify: `apps/web/src/components/requests/RequestsScreen.tsx`(`ApprovalCard`·`CancelApproved` export, `ApprovalCard`에 `onApproved?: (focus: PendingLeave['focus']) => void`), `apps/web/src/app/(app)/manage/page.tsx`
- Create: `apps/web/src/components/mobile/MobileManage.tsx`

**Interfaces:**

- Consumes: `loadLeaveApprovals` (Task 2), `PcOnlyList`(1차)
- Produces: `MobileManage({ pending: PendingLeave[]; history: LeaveHistory[] })`
- [ ] **Step 1: 구현** (시안 `5-admin.html` 왼쪽)
  - 「승인 대기 휴가 {n}」 + `ApprovalCard` 목록(인원 부족 경고·대체 후보·반려 사유 입력·승인). `onApproved`: `focus`가 있으면 `router.push(`/?ym=${focus.ym}&tab=all&date=${focus.date}&shift=${focus.shift}`)`(Task 6이 이 주소로 대체 지정 시트를 연다). 데스크톱은 지금처럼 `/adjust?…`(기본값).
  - 「최근 처리」 이력(`CancelApproved` 포함).
  - 아래에 「PC에서 이용해 주세요」 목록(1차 그대로).
- [ ] **Step 2: 확인** — 데스크톱 `e2e/requests.spec.ts`(승인 흐름) PASS, `typecheck`·`lint`
- [ ] **Step 3:** 커밋 `feat(web): 모바일 관리 탭 — 휴가 승인·처리 이력`

---

### Task 4: 편집 상태 훅, 하루 휴가 초안, 관리자 조정 데이터 액션

**Files:**

- Create: `apps/web/src/components/adjust/useAdjustDraft.ts`
- Modify: `apps/web/src/components/adjust/AdjustScreen.tsx`(훅 사용), `apps/web/src/server/adjust/draft.ts`(+test), `apps/web/src/server/adjust/actions.ts`(+`actions.test.ts` 액션 수 9)

**Interfaces:**

- Produces:
  - `useAdjustDraft(view: AdjustView): { edits: CellEdit[]; leaves: DraftLeave[]; base: GridCell[]; draftInput: ScheduleInput | null; unsaved: number; pendingViews: Map<string, GridCellView>; addEdits(next: CellEdit[]): void; addLeave(leave: DraftLeave, edits?: CellEdit[]): void; revert(k: string): void; reset(): void; save(): Promise<SaveResult> }` — 지금 `AdjustScreen`의 `edits/leaves/groups/draftInput/base/pendingViews/addEdits/revert/resetDraft/save` 본문을 옮긴다(`save`는 결과만 돌려주고 메시지는 호출부가).
  - `export function dayLeave(cells: readonly GridCell[], a: { userId: string; date: IsoDate; type: LeaveType; reasonCode?: string }): DraftLeave` — `startDate = endDate = date`, `cells = [{ date, before: 그 칸 }]`(`draft.ts`).
  - `export async function adminAdjustViewAction(input: { year: number; month: number }): Promise<{ ok: true; view: AdjustView } | { ok: false; message: string }>` — `adminOnly`, `loadAdjustView(db, { ym, viewer: { id, role: 'admin' }, today })`.
- [ ] **Step 1: 실패하는 테스트** — `draft.test.ts`: `dayLeave`가 10/20 D 칸을 `{ startDate: '2026-10-20', endDate: '2026-10-20', cells: [{ date: '2026-10-20', before: { code: 'D' } }] }`로, `applyDraftLeaves`에 넣으면 그 칸만 휴가. `actions.test.ts`: 내보낸 액션 9개, `adminAdjustViewAction`은 비관리자에게 DENIED.
- [ ] **Step 2:** FAIL → **Step 3:** 구현, `AdjustScreen`은 훅으로 교체(동작 그대로) → **Step 4:** 단위 PASS, 데스크톱 `e2e/adjust.spec.ts e2e/feedback-2.spec.ts e2e/requests.spec.ts` PASS
- [ ] **Step 5:** 커밋 `refactor(web): 근무 조정 편집 상태 훅 분리, 하루 휴가 초안·관리자 조정 데이터 액션`

---

### Task 5: 도크 본문을 시트용으로 (휴가는 리롤 없이 하루)

**Files:**

- Modify: `apps/web/src/components/adjust/Dock.tsx`(`CellBody`·`ReplacementBody`에 `variant?: 'dock' | 'sheet'`, `CellBody`에 `leaveMode?: 'reroll' | 'day'`), 새 내부 컴포넌트 `LeaveDay`

**Interfaces:**

- Consumes: `dayLeave`(Task 4)
- Produces: `CellBody`의 새 prop `onLeaveDay?: (leave: DraftLeave) => void` — `leaveMode === 'day'`이면 `LeaveReroll` 대신 `LeaveDay`(휴가 종류 칩 `DOCK_LEAVES`, 사유가 필요한 종류는 사유 선택) → `onLeaveDay(dayLeave(...))`.
- `variant === 'sheet'`: 가로 3단 배치(`bodyCls`) 대신 세로 한 열, 칩 버튼 높이 40px 이상.
- [ ] **Step 1: 구현** — 데스크톱 기본값(`dock`, `reroll`)은 지금 그대로.
- [ ] **Step 2: 확인** — 데스크톱 `e2e/adjust.spec.ts e2e/feedback-2.spec.ts` PASS, `typecheck`·`lint`
- [ ] **Step 3:** 커밋 `feat(web): 도크 본문 시트 배치, 휴대폰은 하루 휴가 넣기`

---

### Task 6: 근무표 「전체」에서 급한 변경 시트

**Files:**

- Create: `apps/web/src/components/mobile/MobileUrgentEdit.tsx`
- Modify: `apps/web/src/components/mobile/MobileSchedule.tsx`(관리자면 명단 이름이 버튼), `apps/web/src/app/(app)/page.tsx`(관리자 여부·`shift` 딥링크 전달)

**Interfaces:**

- Consumes: `adminAdjustViewAction`, `useAdjustDraft` (Task 4), `CellBody variant="sheet" leaveMode="day"`, `ReplacementBody variant="sheet"` (Task 5), `BottomSheet` (Task 1)
- Produces:
  - `MobileSchedule`에 prop `admin?: { ym: string; target: { date: IsoDate; shift: 'D' | 'E' | 'N' } | null }` — 있으면 「전체」 명단의 이름(간호사 묶음만)이 버튼, `target`이 있으면 처음부터 대체 지정 시트.
  - `MobileUrgentEdit({ ym: string; target: { kind: 'cell'; userId: string; date: IsoDate } | { kind: 'replace'; date: IsoDate; shift: DutyCode }; onClose: () => void })`
- [ ] **Step 1: 구현** (시안 `5-admin.html` 오른쪽)
  - 시트를 열면 `adminAdjustViewAction`으로 그 달 데이터를 읽는다(읽는 동안 「불러오는 중」). `view.editable`이 false면 `view.blockedReason`을 보여 주고 끝.
  - `cell`: `CellBody`(칩 변경·대체 후보 함께 바꾸기·사유·하루 휴가). `replace`: `ReplacementBody`(대체 지정).
  - 아래 고정 줄: 「저장 전 변경 {unsaved}건」 + 「되돌리기」 + 「저장 · 바로 공개」(`save()` → 성공이면 「n건을 저장했습니다」 표시, 시트 닫고 `router.refresh()`; 실패면 메시지와 위반 목록).
  - 저장 안 한 변경이 있는데 닫으려 하면 `window.confirm('저장하지 않은 변경 {n}건이 사라집니다. 닫을까요?')`.
- [ ] **Step 2: 확인** — `typecheck`·`lint`, 데스크톱 `e2e/schedule.spec.ts` PASS
- [ ] **Step 3:** 커밋 `feat(web): 모바일 급한 근무 변경 — 근무표 전체에서 이름을 눌러 시트로`

---

### Task 7: 의사 관리자 급한 변경

**Files:**

- Modify: `apps/web/src/app/(doctor)/doctor/adjust/page.tsx`(관리자 PC 안내 제거), `apps/web/src/components/doctor/DoctorAdjustScreen.tsx`(`mobile`이면 `AdminDock`을 `BottomSheet` 안에), `apps/web/src/app/(doctor)/doctor/manage/page.tsx`(「근무 바꾸기」 링크 카드 + PC 안내 목록에서 「근무 조정」 줄 제거)

- [ ] **Step 1: 구현** — 관리자가 휴대폰에서 칩을 누르면 도크 내용이 시트로 올라온다(`open = !!first`, 닫기 = `clear`).
- [ ] **Step 2: 확인** — 데스크톱 `e2e/doctor.spec.ts` PASS
- [ ] **Step 3:** 커밋 `feat(web): 의사 관리자 휴대폰 급한 변경`

---

### Task 8: 모바일 관리자 E2E

**Files:**

- Create: `apps/web/e2e/mobile/manage.spec.ts`

- [ ] **Step 1: 테스트 작성** (데스크톱 `e2e/requests.spec.ts`의 「10월 병가 → 인원 영향 경고 → 승인」과 `e2e/adjust.spec.ts`의 안전한 편집 찾기(`findSafeEdit`)를 따른다. 테스트가 만든 휴가·편집은 끝에서 되돌린다)
  - 관리 탭: 간호사가 10월 병가를 제출 → 관리자(모바일) 관리 탭 배지·카드 → 「승인 · 대체 지정」 → URL이 `/?ym=2026-10&tab=all&date=…&shift=…` → 대체 지정 시트에서 후보를 골라 저장 → 「저장했습니다」.
  - 급한 변경: 「전체」에서 이름 → 시트 → 안전한 근무로 바꾸기 → 「저장 · 바로 공개」 → 명단 반영 → 같은 방법으로 되돌려 저장.
  - 신청 중인 달(11월) 「전체」에서 이름을 누르면 편집 대신 안내.
  - 의사 관리자: `/doctor/manage`의 「근무 바꾸기」 → `/doctor/adjust`에서 칩을 누르면 시트.
- [ ] **Step 2: 실행** — scratchpad worktree에서 `playwright test --project=mobile --no-deps` PASS, 이어서 전체 `playwright test` PASS(CI 순서)
- [ ] **Step 3:** 커밋 `test(web): 모바일 관리자 E2E`

---

### Task 9: 마무리와 PR

- [ ] 포맷(`.superpowers/`만 제외)·`typecheck`·`lint`·`test`·`test:int`·`build`, 실명 검사 0건
- [ ] waypoint `12-mobile.md` 「구현 결과 — 3차 PR」, STATUS 배너 → waypoint push → duty 포인터
- [ ] 브랜치 push, PR, CI 확인

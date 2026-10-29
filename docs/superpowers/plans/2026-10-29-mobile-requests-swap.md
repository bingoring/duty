# 3-12 모바일 대응 2차 (신청 + 교환) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 휴대폰에서 근무 신청(달력 + 날짜 시트 + 그날 동료 신청)과 근무 교환(받은·보낸 요청 + 여러 명 교환 요청)을 데스크톱과 같은 기능으로 쓰게 한다. 간호사·의사 모두.

**Architecture:** 1차의 `requestDevice()` 분기를 `/requests`·`/adjust`(간호사)에 추가해 모바일 트리를 그린다. **저장·검사 로직은 새로 쓰지 않는다:** 데스크톱 `RequestPopover`와 `SwapPopup`을 공용 `BottomSheet` 안에 넣어 재사용하고(겉틀 폭만 `variant`로 바꿈), 달력·명단은 기존 `RequestsView`/`AdjustView`를 순수 함수로 다시 묶는다. 의사 신청·교환 화면은 이미 월 달력·주 달력이라 **한 트리 반응형**(`md:` 2열 → 휴대폰 1열, 선택 날짜 패널은 아래 시트)으로 맞춘다.

**Tech Stack:** Next.js 16 App Router(코드 전 `apps/web/node_modules/next/dist/docs` 확인), React 19, Tailwind v4, Vitest, Playwright(`mobile` 프로젝트 = Pixel 7).

**Spec:** `waypoint/projects/duty/03-operations/12-mobile.md` §3 신청·교환 (시안 `inputs/design-mobile/3-requests.html`, `4-swap.html`). 1차 계획 `docs/superpowers/plans/2026-10-29-mobile-shell.md`의 기기 판정·셸을 전제로 한다.

## Global Constraints

- 모바일 = `requestDevice() === 'mobile'`(1차). 데스크톱 트리와 기존 chromium·cycle E2E는 **수정 없이** 통과.
- 서버 액션·서버 검사 규칙은 바꾸지 않는다(`saveShiftRequestAction`, `deleteShiftRequestAction`, `saveLeaveAction`, `cancelLeaveAction`, `submitRequestsAction`, `respondLeaveProposalAction`, `createSwapAction`, `respondSwapAction`, `cancelSwapAction`, 의사 신청·교환 액션).
- 동료 신청 표시: `RequestsView.rows`에 실린 것만(남의 것은 제출된 것만, 메모·휴가 사유 없음). 「쉼 n」 = `offCounts[date]`, **3 이상이면 빨강**(데스크톱 crowded 기준과 같음).
- 간호사 관리자(수간호사)의 모바일 신청 탭은 **보기 전용**(날짜별 누가 무엇을 신청했는지). 대신 신청·휴가 승인은 이번 PR에서 다루지 않는다(대신 신청 = PC, 휴가 승인 = 3차).
- 교환: 사람 수 2~10명, 수간호사 칸은 S↔D만, 규칙 검사·`sameCounts`는 데스크톱 `SwapPopup` 그대로.
- 시트는 화면 안 닫기 버튼과 배경 탭·Escape로 닫힌다(standalone에는 뒤로 가기가 없음).
- 실명 금지(가명 시드), 커밋 트레일러 없음, 커밋 전 `.local/check-privacy.py` 0건.

## Review Focus

- 신청 기간이 아닌 달(`editable === 'none'`)·휴가만 되는 달(`'leave'`)에 날짜를 누르면: 근무 신청 칸은 막히고 동료 신청 목록만 보인다(오류 없이).
- 관리자가 넣은 신청(파란 표시)·관리자가 넣은 휴가는 간호사 시트에서 잠금 안내만 보인다(데스크톱 `lockedForNurse` 그대로).
- 교환 협의 기간이 아니면(`swap.window.open === false`) 「＋ 교환 요청」이 비활성이고 받은 요청 목록은 보인다.
- 지난 날짜·휴가 칸이 있는 사람은 교환 대상에서 고를 수 없다(데스크톱 `swappable` 규칙과 같게 흐림).
- 시트를 연 채 30초 새로고침이 와도 시트가 닫히거나 입력이 사라지지 않는다(데스크톱처럼 시트가 열려 있으면 새로고침을 미룬다).

---

### Task 1: 공용 아래 시트, 팝오버 겉틀 변형

**Files:**
- Create: `apps/web/src/components/mobile/BottomSheet.tsx`
- Modify: `apps/web/src/components/requests/RequestPopover.tsx` (`Shell`), `apps/web/src/components/adjust/NurseAdjust.tsx` (`SwapPopup` 루트 className, `SwapPopup`·`SentList` export)

**Interfaces:**
- Produces:
  - `BottomSheet({ label: string; onClose: () => void; children: React.ReactNode })` — 클라이언트. `role="dialog" aria-modal="true" aria-label={label}`, 배경(`fixed inset-0 bg-ink/35`) 탭·Escape로 `onClose`, 패널 `fixed inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[18px] bg-surface px-4 pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))]`, 손잡이 막대, 열려 있는 동안 `body` 스크롤 잠금.
  - `RequestPopover`에 prop `variant?: 'popover' | 'sheet'`(기본 popover). sheet면 `Shell`이 테두리·그림자·`w-[340px]` 없이 `w-full`.
  - `SwapPopup`에 prop `variant?: 'popover' | 'sheet'`. sheet면 `absolute top-[110px] left-[260px] w-[400px] …` 대신 `flex w-full flex-col gap-3 text-[13px]`. `export function SwapPopup`.
  - `SwapPanel`의 보낸 요청 목록을 `export function SentList({ sent, onDone })`로 꺼낸다(`ReceivedList`와 같은 모양, 철회 버튼 포함). `SwapPanel`은 `SentList`를 쓴다.

- [ ] **Step 1:** 리팩터만 하는 작업이라 새 단위 테스트는 없다. 데스크톱 회귀를 기준으로 삼는다: 변경 전 `playwright test e2e/requests.spec.ts e2e/swap.spec.ts --project=chromium`이 통과하는지 확인
- [ ] **Step 2:** 위 Interfaces대로 구현(기본값이 popover라 데스크톱 호출부는 그대로)
- [ ] **Step 3:** `typecheck`·`lint`, 같은 E2E 다시 → PASS
- [ ] **Step 4:** 커밋 `refactor(web): 신청 팝오버·교환 창을 시트에서도 쓰게 겉틀 변형, 아래 시트 추가`

---

### Task 2: 신청 달력 데이터 묶기(순수 함수)

**Files:**
- Create: `apps/web/src/server/requests/mobile.ts`, `apps/web/src/server/requests/mobile.test.ts`

**Interfaces:**
- Consumes: `RequestsView`, `RequestRowDTO`, `RequestCellDTO` (`server/requests/dto.ts`), `toWeeks`(1차 `server/schedule/mobile.ts`)는 `MyDay` 전용이라 쓰지 않고 같은 방식으로 주를 나눈다(일요일 시작).
- Produces:

```ts
export type ReqMark = { label: string; kind: 'shift' | 'leave'; byAdmin: boolean; draft: boolean }
export type ReqDay = { date: IsoDate; day: number; red: boolean; mine: ReqMark | null; rest: number; hot: boolean; count: number }
export type ReqMonth = { weeks: (ReqDay | null)[][] }
export type PeerRequest = { userId: string; name: string; label: string; kind: 'shift' | 'leave'; byAdmin: boolean }
export function requestMonth(view: RequestsView): ReqMonth
export function peerRequests(view: RequestsView, date: IsoDate): PeerRequest[] // 내 행 제외, kind 있는 칸만, 표 순서
```

`red` = `days[i].color === 'sun' || (days[i].red && days[i].color !== 'sat')`(1차와 같은 규칙). `rest` = `offCounts[date] ?? 0`, `hot` = `rest >= 3`. `count` = 그날 신청이 있는 사람 수(내 행 포함, 관리자 보기용).

- [ ] **Step 1: 실패하는 테스트** — 3명 × 12월 작은 `RequestsView` 픽스처(내 행 `me: true`):

```ts
it('12월 1일은 화요일 → 첫 주 앞 2칸 null', () => expect(requestMonth(dec).weeks[0]!.slice(0, 2)).toEqual([null, null]))
it('내 신청 표시: 라벨·종류·관리자 표시·임시 저장', () =>
  expect(find(requestMonth(dec), '2026-12-04')?.mine).toEqual({ label: 'O', kind: 'shift', byAdmin: false, draft: true }))
it('쉼 n과 3 이상 빨강', () => {
  expect(find(requestMonth(dec), '2026-12-24')).toMatchObject({ rest: 5, hot: true })
  expect(find(requestMonth(dec), '2026-12-03')).toMatchObject({ rest: 2, hot: false })
})
it('그날 신청한 사람 수', () => expect(find(requestMonth(dec), '2026-12-04')?.count).toBe(2))
it('동료 신청: 내 행 제외, 신청 있는 사람만, 휴가 포함', () =>
  expect(peerRequests(dec, '2026-12-04')).toEqual([{ userId: 'u2', name: '윤채원', label: 'D/E', kind: 'shift', byAdmin: false }]))
it('관리자가 넣은 신청은 byAdmin', () => expect(peerRequests(dec, '2026-12-09')[0]?.byAdmin).toBe(true))
it('신청 없는 날은 빈 배열', () => expect(peerRequests(dec, '2026-12-02')).toEqual([]))
```

- [ ] **Step 2:** `vitest run src/server/requests/mobile.test.ts` → FAIL(모듈 없음)
- [ ] **Step 3:** 구현
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** 커밋 `feat(web): 모바일 신청 달력·그날 동료 신청 묶기`

---

### Task 3: 간호사 모바일 신청 화면

**Files:**
- Create: `apps/web/src/components/mobile/MobileRequests.tsx`
- Modify: `apps/web/src/app/(app)/requests/page.tsx`

**Interfaces:**
- Consumes: `requestMonth`, `peerRequests` (Task 2), `BottomSheet`, `RequestPopover variant="sheet"` (Task 1), `ProposalPanel`(기존, 받은 휴가 변경 요청), `submitRequestsAction`, `requestDevice`
- Produces: `MobileRequests({ view: RequestsView; viewerId: string; prevHref: string; nextHref: string })`

- [ ] **Step 1: 구현** (시안 `3-requests.html`)
  - 제목 줄 「{월}월 근무 신청」 + ‹ › 링크(데스크톱과 같은 `ym`).
  - 위 카드(검은 카드): `마감 {deadline} · {남은 날}`(마감 없으면 생략), `cards.mineText`, 제출 상태(`unsubmitted > 0`이면 「제출 전 {n}건」), 버튼 「신청 제출」(`submitRequestsAction({ year, month })`, 결과 메시지 표시, `unsubmitted === 0`이면 비활성). 관리자는 카드 대신 「날짜를 누르면 그날 신청을 봅니다 · 대신 신청은 PC에서」 안내.
  - `ProposalPanel`(받은 휴가 변경 요청)이 있으면 카드 아래.
  - 7열 달력: 칸마다 날짜 숫자(`red`), 내 신청 칩(`mine.label`, 빨간 테두리 = 본인, 파란 점 = `byAdmin`, 임시 저장이면 점선), 아래 작은 글씨 「쉼 {rest}」(`hot`이면 빨강 굵게). 관리자는 「쉼 n」 대신 「신청 {count}」.
  - 날짜를 누르면 `BottomSheet`(label = 「{M/D (요일)} 신청」):
    - 간호사이고 `editable !== 'none'`: `<RequestPopover variant="sheet" userId={viewerId} … mode={editable === 'all' ? 'all' : 'leave'} isAdmin={false} own />`, `cell`은 내 행의 그 날짜 칸, `head`는 내 행의 `head`, `sameDay`는 데스크톱 `RequestsScreen`이 계산하는 것과 같은 문자열(같은 계산을 함수로 꺼내 공유: `export function sameDayText(view, date): string`을 `RequestsScreen.tsx`에서 `server/requests/mobile.ts`로 옮긴다).
    - `editable === 'none'`이면 「신청 기간이 아닙니다」.
    - 아래에 「이 날 신청한 동료 {n}명」 목록(`peerRequests`: 이름 · 라벨, `byAdmin`이면 파란 점). 관리자는 이 목록만(자기 행 포함해 모두 → `peerRequests` 대신 rows 전체에서 그날 칸이 있는 사람, Task 2 함수에 `includeMe` 인자를 두지 말고 관리자는 `[mine, ...peers]`로 합친다).
  - 시트가 열려 있는 동안 주기 새로고침을 하지 않는다(데스크톱 `RequestsScreen`의 새로고침 방식이 있으면 같은 조건으로 막는다).
- [ ] **Step 2: 페이지 분기** — `(app)/requests/page.tsx`: 기존 뷰 로드 뒤 `requestDevice() === 'mobile'`이면 `<MobileRequests …/>`, 아니면 지금 그대로.
- [ ] **Step 3: 확인** — `typecheck`·`lint`. 데스크톱 `playwright test e2e/requests.spec.ts e2e/feedback-2.spec.ts e2e/feedback-3.spec.ts --project=chromium` PASS. 브라우저 375px로 `/requests?ym=2026-11` 열어 시안과 비교.
- [ ] **Step 4: 커밋** `feat(web): 모바일 근무 신청 — 달력·날짜 시트·그날 동료 신청`

---

### Task 4: 교환 데이터(순수 함수)와 맞바꾸기 규칙 분리

**Files:**
- Create: `apps/web/src/components/adjust/swap-codes.ts`, `swap-codes.test.ts`, `apps/web/src/server/adjust/mobile.ts`, `apps/web/src/server/adjust/mobile.test.ts`
- Modify: `apps/web/src/components/adjust/NurseAdjust.tsx` (`swapCodes`를 import로)

**Interfaces:**
- Produces:
  - `export function swapCodes(codes: SwapCode[], a: number, b: number, isHead: (i: number) => boolean): SwapCode[] | null` (본문은 지금 `NurseAdjust.tsx`의 것 그대로 옮김)
  - `export type SwapPerson = { id: string; name: string; code: string; selectable: boolean }`
  - `export type SwapGroup = { code: string; people: SwapPerson[] }`
  - `export function swapGroups(view: AdjustView, date: IsoDate, viewerId: string): { mine: string | null; groups: SwapGroup[] }` — 그날 내 근무와, 나를 뺀 사람들을 근무별(D·E·N·S·OFF·그 밖) 묶음. `selectable` = `view.swap.selectable`에 있고 그 칸이 `swappable`(휴가 칸 아님)일 때.
  - `export function swapDates(view: AdjustView): IsoDate[]` — 그 달 날짜 중 `view.today` 이후(오늘 포함 여부는 데스크톱 `NurseAdjust`의 지난 날짜 판정과 같게).

- [ ] **Step 1: 실패하는 테스트**
  - `swap-codes.test.ts`: 두 사람 맞바꾸기, 수간호사가 받은 OFF는 S, 교대 근무자가 받은 S는 OFF, 수간호사가 E를 받으면 `null`.
  - `server/adjust/mobile.test.ts`(작은 `AdjustView` 픽스처): `swapGroups`가 내 근무 `'N'`, 묶음 `[{code:'D',…},{code:'E',…},{code:'OFF',…}]`, 휴가 칸인 사람은 `selectable: false`; `swapDates`가 오늘 이전 날짜를 뺀다.
- [ ] **Step 2:** 두 파일 `vitest run` → FAIL
- [ ] **Step 3:** 구현, `NurseAdjust.tsx`는 `swapCodes`를 import
- [ ] **Step 4:** PASS, 데스크톱 `e2e/swap.spec.ts` PASS
- [ ] **Step 5:** 커밋 `feat(web): 모바일 교환 대상 묶기, 맞바꾸기 규칙 분리`

---

### Task 5: 간호사 모바일 교환 화면

**Files:**
- Create: `apps/web/src/components/mobile/MobileSwap.tsx`
- Modify: `apps/web/src/app/(app)/adjust/page.tsx`

**Interfaces:**
- Consumes: `swapGroups`, `swapDates` (Task 4), `BottomSheet`, `SwapPopup variant="sheet"`, `ReceivedList`, `SentList` (Task 1)
- Produces: `MobileSwap({ view: AdjustView; viewerId: string })`

- [ ] **Step 1: 구현** (시안 `4-swap.html`)
  - 제목 「{월}월 근무 교환」 + ‹ ›. 협의 기간 안내 줄(`swap.window.label`, 닫혀 있으면 회색). 근무표가 없는 달(`!view.swap`)이면 「확정된 근무표가 있는 달에서 교환을 요청할 수 있습니다.」
  - 「받은 요청」(`ReceivedList`) · 「보낸 요청」(`SentList`) 두 묶음, 각 제목에 수.
  - 오른쪽 아래 떠 있는 버튼 「＋ 교환 요청」(아래 탭 위, `bottom-[calc(76px+env(safe-area-inset-bottom))]`), 기간이 닫혀 있으면 비활성.
  - 시트 1단계(label 「교환 요청」): 날짜 띠(`swapDates`) → 고르면 「{M/D (요일)} · 나는 {mine}」, 근무별 칩 묶음(`swapGroups`)에서 여러 명 토글(`selectable: false`는 흐리고 못 누름). 「다음」(1명 이상).
  - 시트 2단계: `<SwapPopup variant="sheet" view date people={[viewerId, ...골라낸 순서대로]} viewerId nameOf onClose={1단계로} onSent={시트 닫고 메시지·router.refresh()} />`.
  - 30초·포커스 새로고침은 데스크톱처럼 시트가 열려 있으면 미룬다.
- [ ] **Step 2: 페이지 분기** — `(app)/adjust/page.tsx`: 관리자 PC 안내(1차) 다음에, 간호사이고 모바일이면 `<MobileSwap key={view.ym} …/>`.
- [ ] **Step 3: 확인** — `typecheck`·`lint`, 데스크톱 `e2e/swap.spec.ts e2e/adjust.spec.ts` PASS, 브라우저 375px로 `/adjust` 확인.
- [ ] **Step 4: 커밋** `feat(web): 모바일 근무 교환 — 받은·보낸 요청, 여러 명 교환 요청`

---

### Task 6: 의사 신청·교환 반응형

**Files:**
- Modify: `apps/web/src/components/doctor/DoctorRequestsScreen.tsx`, `apps/web/src/components/doctor/DoctorAdjustScreen.tsx`, `apps/web/src/components/doctor/DoctorCalendar.tsx`(폭 고정 부분만), 필요하면 `apps/web/src/app/(doctor)/doctor/requests/page.tsx`·`adjust/page.tsx`의 바깥 여백

**Interfaces:**
- Consumes: `BottomSheet`(Task 1)
- Produces: 없음(같은 컴포넌트가 폭에 따라 배치만 바뀜)

- [ ] **Step 1: 구현** — 데스크톱 클래스는 `md:`로 옮기고 휴대폰 기본값을 새로 준다:
  - `DoctorRequestsScreen`: `grid-cols-[minmax(0,1fr)_300px]` → `grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px]`. `DayCell` 최소 높이 `min-h-[56px] md:min-h-[86px]`, 칸 안 남의 신청 줄은 휴대폰에서 숨기고 점 하나로. 오른쪽 「{날짜} 신청」 카드는 휴대폰에서 날짜를 누르면 `BottomSheet` 안에 같은 카드를 그린다(같은 JSX를 함수로 꺼내 두 곳에서 호출; 폭 판정은 `useSyncExternalStore` + `matchMedia('(max-width: 767px)')`, 서버 스냅샷 false).
  - `DoctorAdjustScreen`: `grid-cols-[minmax(0,1fr)_280px]` → `grid-cols-1 md:…`, 교환 패널은 달력 아래로. 칩 두 개를 고르면 나오는 교환 요청 확인 영역은 휴대폰에서 `BottomSheet`.
  - `DoctorCalendar`: 고정 `w-[250px]` → `w-full md:w-[250px]`, 칩 `min-w-[60px]` → `min-w-0 md:min-w-[60px]` 등 넘침을 일으키는 고정 폭만.
- [ ] **Step 2: 확인** — 데스크톱 `e2e/doctor.spec.ts` PASS(수정 없이), 브라우저 375px로 `/doctor/requests`·`/doctor/adjust` 가로 넘침 없음.
- [ ] **Step 3: 커밋** `feat(web): 의사 신청·교환 화면 휴대폰 배치`

---

### Task 7: 모바일 E2E

**Files:**
- Create: `apps/web/e2e/mobile/requests-swap.spec.ts`

**Interfaces:**
- Consumes: `NURSE`, `ADMIN`, `loginAndWait`, `waitHydrated`, `setToday` (`e2e/fixtures.ts`). 데스크톱 `e2e/requests.spec.ts`·`swap.spec.ts`가 쓰는 달·날짜·상대(신청 기간 달, 협의 기간 달, `findSwapPair`)를 그대로 따른다.

- [ ] **Step 1: 테스트 작성**
  - 간호사 신청: 신청 기간 달을 열고 날짜를 눌러 시트 → OFF·E 선택 → 「임시 저장」 → 달력 칸에 칩 → 다시 열어 「신청 삭제」(데스크톱 팝오버 버튼 이름 그대로) → 칩 사라짐. 시트에 「이 날 신청한 동료」 제목이 보인다. 가로 넘침 없음.
  - 신청 제출: 「신청 제출」 → 결과 메시지.
  - 관리자 신청 탭: 시트에 근무 선택 버튼이 없고 그날 신청 목록만.
  - 교환: 협의 기간 달(`swap.spec.ts`와 같은 설정)에서 「＋ 교환 요청」 → 날짜 → 상대 칩 → 「다음」 → 규칙 검사 문구 → 「요청 보내기」 → 「보낸 요청」에 생김 → 「철회」.
  - 의사: `/doctor/requests`·`/doctor/adjust` 가로 넘침 없음, 날짜를 누르면 시트에 D·N·올데이·O 버튼.
- [ ] **Step 2: 실행** — scratchpad worktree에서 `playwright test --project=mobile --no-deps` PASS, 이어서 전체 `playwright test` PASS
- [ ] **Step 3: 커밋** `test(web): 모바일 신청·교환 E2E`

---

### Task 8: 마무리와 PR

- [ ] `pnpm format:check`, `typecheck`, `lint`, `test`, `test:int`, `build` 통과, 실명 검사 0건
- [ ] waypoint `12-mobile.md`에 「구현 결과 — 2차 PR」, STATUS 배너 갱신 → waypoint master push → duty 포인터 커밋
- [ ] 브랜치 push, PR(본문 끝 「🤖 Generated with [Claude Code](https://claude.com/claude-code)」), CI 확인

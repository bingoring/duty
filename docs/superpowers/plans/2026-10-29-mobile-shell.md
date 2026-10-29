# 3-12 모바일 대응 1차 (틀 + 근무표 + 홈 화면 추가) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 휴대폰(768px 미만)에서 아래 탭 셸, 한 열 로그인, 홈 화면 추가(PWA), 「오늘 내 근무」 카드 + 내 근무 달력 + 날짜별 명단 근무표(간호사·의사), 더보기, 관리자 화면 PC 안내를 제공한다. 데스크톱은 그대로다.

**Architecture:** `proxy.ts`가 뷰포트 쿠키 → user-agent 순으로 기기를 판정해 `x-device` 헤더를 넣고, 레이아웃·페이지는 `requestDevice()`로 읽어 데스크톱 트리와 모바일 트리 중 **하나만** 렌더링한다. 클라이언트 `ViewportSync`가 마운트 뒤 `matchMedia`와 서버 판정이 다르면 쿠키를 쓰고 `router.refresh()`한다. 모바일 근무표는 기존 `ScheduleView`/`DoctorScheduleView`를 순수 함수로 다시 묶어서 만든다(서버 쿼리 추가 없음, 오늘 카드만 오늘 달·다음 달을 추가로 읽을 수 있음).

**Tech Stack:** Next.js 16 App Router(코드 쓰기 전 `apps/web/node_modules/next/dist/docs` 해당 문서를 읽는다), React 19, Tailwind v4, Vitest, Playwright.

**Spec:** `waypoint/projects/duty/03-operations/12-mobile.md` (시안 `waypoint/projects/duty/inputs/design-mobile/1-home.html`, `2-team.html`, `5-admin.html`의 PC 안내 목록)

## Global Constraints

- 모바일 기준: 폭 767px 이하(`(max-width: 767px)`), Tailwind `md:` = 768px 이상이 데스크톱.
- 기존 chromium·cycle E2E는 **수정 없이** 통과해야 한다(데스크톱 UA, 폭 1280 이상).
- 뷰포트 쿠키 이름 `duty_vp`, 값 `mobile` | `desktop`, `path=/`, `max-age=31536000`, `samesite=lax`. 헤더 이름 `x-device`.
- 모바일 탭: 간호사 근무표 `/`·신청 `/requests`·교환 `/adjust`·더보기 `/more`; 간호사 관리자 근무표·신청·관리 `/manage`·더보기. 의사 `/doctor`·`/doctor/requests`·`/doctor/adjust`·`/doctor/more`; 의사 관리자 교환 대신 `/doctor/manage`.
- 홈 딥링크: `?tab=all&date=YYYY-MM-DD`(`view`는 기존 직군 전환이 계속 쓴다).
- 오늘 날짜는 늘 서버 `requestToday()`(E2E 가짜 날짜 포함). 클라이언트 `new Date()`로 오늘을 정하지 않는다.
- PWA: 이름 `벌써 근무표짤 때가 됐어?`, 짧은 이름 `근무표`, `display: 'standalone'`, `start_url: '/'`, `theme_color`·`themeColor` `#0f6e63`(`--color-primary`), `background_color` `#f6f4ef`(`--color-app`). 서비스 워커·오프라인·푸시 없음.
- 공개 저장소: 실명·실사번 금지(가명 시드만). 커밋 전 `python3 .local/check-privacy.py` 결과 `hits 0`.
- 커밋은 conventional 한 줄, `Co-Authored-By` 등 트레일러 없음(사용자 규칙).
- 이 PR에서 `/requests`·`/adjust`(관리자 아님)의 모바일 전용 화면은 만들지 않는다(2차 PR). 그동안 모바일 셸 안에 기존 데스크톱 트리를 가로 스크롤로 보여 준다.

## Review Focus

- 월말(예: 10/31)에 「내일 근무」는 다음 달 근무표에서 읽고, 다음 달 근무표가 없으면 내일 줄을 생략한다(오류 없이).
- 내 행이 없는 경우(근무표 없는 달, 의사가 간호사표를 볼 때, 재직 전 달): 내 달력은 빈 칸, 오늘 카드는 「근무표가 아직 없습니다」, 명단은 정상.
- `?ym=`으로 다른 달을 보고 있어도 오늘 카드는 오늘 기준이다.
- 로그인하지 않은 요청이 `/manifest.webmanifest`·`/icon…`·`/apple-icon…`을 받으면 302가 아니라 200이다.
- 서버 판정과 화면 폭이 계속 어긋나도(쿠키 차단 등) `ViewportSync`는 마운트당 `router.refresh()`를 한 번만 한다.

---

### Task 1: 기기 판정과 proxy

**Files:**

- Create: `apps/web/src/server/device.ts`, `apps/web/src/server/device.test.ts`
- Modify: `apps/web/src/proxy.ts`

**Interfaces:**

- Produces:
  - `export type Device = 'mobile' | 'desktop'`
  - `export const VIEWPORT_COOKIE = 'duty_vp'`, `export const DEVICE_HEADER = 'x-device'`
  - `export function detectDevice(a: { cookie: string | undefined; ua: string }): Device` (순수)
  - `export async function requestDevice(): Promise<Device>` (`headers()`의 `x-device`, 없거나 이상하면 `'desktop'`)
  - `proxy.ts`의 `config.matcher`가 manifest·아이콘 경로를 제외

- [ ] **Step 1: 실패하는 테스트 작성** (`device.test.ts`, `requestDevice`는 `server-only`라 `detectDevice`와 matcher만 시험)

```ts
it('쿠키가 user-agent보다 앞선다', () => {
  expect(detectDevice({ cookie: 'desktop', ua: IPHONE_UA })).toBe('desktop')
  expect(detectDevice({ cookie: 'mobile', ua: MAC_CHROME_UA })).toBe('mobile')
})
it('쿠키가 없거나 이상하면 user-agent: 휴대폰 = mobile, 태블릿·데스크톱 = desktop', () => {
  expect(detectDevice({ cookie: undefined, ua: IPHONE_UA })).toBe('mobile')
  expect(detectDevice({ cookie: 'x', ua: ANDROID_PHONE_UA })).toBe('mobile') // Pixel 7 UA
  expect(detectDevice({ cookie: undefined, ua: IPAD_UA })).toBe('desktop')
  expect(detectDevice({ cookie: undefined, ua: MAC_CHROME_UA })).toBe('desktop')
  expect(detectDevice({ cookie: undefined, ua: '' })).toBe('desktop')
})
it('matcher가 PWA 파일을 로그인 검사에서 뺀다', () => {
  const re = new RegExp(`^${config.matcher[0]}$`)
  for (const p of ['/manifest.webmanifest', '/icon', '/icon/192', '/apple-icon', '/login', '/privacy'])
    expect(re.test(p)).toBe(false)
  for (const p of ['/', '/requests', '/doctor', '/more']) expect(re.test(p)).toBe(true)
})
```

UA 상수는 테스트 파일에 실제 문자열로 둔다(Playwright `devices['Pixel 7']`·`devices['Desktop Chrome']`의 UA 포함).

- [ ] **Step 2: 실행해 실패 확인** — `pnpm --dir apps/web exec vitest run src/server/device.test.ts` → FAIL(모듈 없음)

- [ ] **Step 3: 구현**
  - `detectDevice`: 쿠키가 `mobile`/`desktop`이면 그대로. 아니면 Next `userAgent({ headers })`의 `device.type === 'mobile'`을 쓰거나, 순수 함수로 두려면 `/Mobi|iPhone|iPod|Android.*Mobile/i` 정규식(iPad·Android 태블릿은 desktop). 둘 중 테스트가 통과하는 쪽을 고른다.
  - `proxy.ts`: 세션 쿠키가 있을 때 기존 `x-pathname`과 함께 `x-device`를 넣는다. matcher를 `'/((?!_next/|api/|login|privacy|fonts/|favicon.ico|manifest.webmanifest|icon|apple-icon).*)'`로.
  - `requestDevice`: `import 'server-only'`, `(await headers()).get(DEVICE_HEADER) === 'mobile' ? 'mobile' : 'desktop'`.

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS. `pnpm --dir apps/web typecheck`

- [ ] **Step 5: 커밋** — `git commit -m "feat(web): 기기 판정(x-device)과 PWA 파일 로그인 검사 제외"`

---

### Task 2: 모바일 셸·아래 탭·뷰포트 보정, 로그인 한 열

**Files:**

- Create: `apps/web/src/components/shell/mobile-tabs.ts`, `mobile-tabs.test.ts`, `MobileShell.tsx`, `BottomTabs.tsx`, `ViewportSync.tsx`
- Modify: `apps/web/src/components/shell/AppShell.tsx`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(doctor)/doctor/layout.tsx`, `apps/web/src/components/auth/AuthFrame.tsx`, `apps/web/src/components/auth/LoginHero.tsx`

**Interfaces:**

- Consumes: `Device`, `requestDevice`, `VIEWPORT_COOKIE` (Task 1); `isActive` (`nav-items.ts`)
- Produces:
  - `export type MobileTab = { href: string; label: '근무표' | '신청' | '교환' | '관리' | '더보기'; icon: string; badge?: 'swap' | 'proposal' }`
  - `export function mobileTabs(group: 'nurse' | 'doctor', isAdmin: boolean): MobileTab[]`
  - `AppShell`에 prop `device: Device` 추가(필수). `mobile`이면 사이드바 대신 `MobileShell`을 그린다.
  - `<ViewportSync device={device} />` (클라이언트)

- [ ] **Step 1: 실패하는 테스트** (`mobile-tabs.test.ts`)

```ts
it('간호사', () =>
  expect(mobileTabs('nurse', false).map((t) => t.href)).toEqual(['/', '/requests', '/adjust', '/more']))
it('간호사 관리자: 교환 대신 관리', () =>
  expect(mobileTabs('nurse', true).map((t) => t.label)).toEqual(['근무표', '신청', '관리', '더보기']))
it('의사', () =>
  expect(mobileTabs('doctor', false).map((t) => t.href)).toEqual([
    '/doctor',
    '/doctor/requests',
    '/doctor/adjust',
    '/doctor/more',
  ]))
it('의사 관리자', () =>
  expect(mobileTabs('doctor', true).map((t) => t.href)).toEqual([
    '/doctor',
    '/doctor/requests',
    '/doctor/manage',
    '/doctor/more',
  ]))
it('배지: 교환 = swap, 간호사 신청 = proposal', () => {
  expect(mobileTabs('nurse', false).find((t) => t.label === '교환')?.badge).toBe('swap')
  expect(mobileTabs('nurse', false).find((t) => t.label === '신청')?.badge).toBe('proposal')
  expect(mobileTabs('doctor', false).find((t) => t.label === '신청')?.badge).toBeUndefined()
})
```

- [ ] **Step 2: 실패 확인** — `pnpm --dir apps/web exec vitest run src/components/shell/mobile-tabs.test.ts` → FAIL

- [ ] **Step 3: 구현**
  - `mobile-tabs.ts`: 위 표대로. 아이콘은 시안의 글자(`▦ ✎ ⇄ ✓ ≡`).
  - `BottomTabs.tsx`(클라이언트, `usePathname` + `isActive`): `<nav aria-label="아래 탭">` 고정 하단, 높이 56px + `pb-[env(safe-area-inset-bottom)]`, 활성 `text-primary font-bold`, 배지는 `NavList`와 같은 빨간 원(수, `aria-label` 「받은 교환 요청 n」 등).
  - `MobileShell.tsx`: `<div className="min-h-dvh bg-app">` → `{children}`을 `<main className="min-w-0 overflow-x-auto pb-[calc(56px+env(safe-area-inset-bottom))]">`에 → **그 뒤에** `BottomTabs`(DOM에서 본문 뒤). `SessionKeeper`(persistent일 때)와 `ViewportSync` 포함.
  - `AppShell`: `device === 'mobile'`이면 `MobileShell`을 반환. 데스크톱 경로는 지금 마크업 그대로에 `ViewportSync`만 추가.
  - 두 레이아웃: `const device = await requestDevice()`를 넘긴다.
  - `ViewportSync`: 마운트 때 `matchMedia('(max-width: 767px)')`로 `want`를 정하고 `want !== device`면 `document.cookie`에 `duty_vp`를 쓰고 `router.refresh()`. `useRef`로 마운트당 한 번만 refresh. `change` 이벤트도 같은 처리(한 번 제한은 유지하되 이벤트마다 쿠키는 갱신).
  - `AuthFrame`: `grid min-h-dvh bg-app md:min-w-[1280px] md:grid-cols-[1fr_480px]`, 오른쪽 열 `px-5 py-8 md:px-12 md:py-14`. `LoginHero`는 `hidden md:flex`, 대신 폼 열 위에 `md:hidden` 작은 제목(`벌써 근무표짤 때가 됐어?`, `text-xl font-extrabold`). 인증 화면은 proxy 밖이라 CSS 한 트리로 처리한다.

- [ ] **Step 4: 확인**
  - `pnpm --dir apps/web exec vitest run src/components/shell` → PASS, `pnpm --dir apps/web typecheck`·`lint` 통과
  - 데스크톱 E2E 회귀: scratchpad worktree에서 `pnpm --dir apps/web exec playwright test e2e/auth.spec.ts e2e/schedule.spec.ts --project=chromium` → 전부 PASS(사용자 `pnpm dev` 폴더에서 돌리지 않는다)

- [ ] **Step 5: 커밋** — `feat(web): 모바일 셸과 아래 탭, 뷰포트 보정, 로그인 한 열`

---

### Task 3: 홈 화면 추가(PWA)

**Files:**

- Create: `apps/web/src/app/manifest.ts`, `apps/web/src/app/manifest.test.ts`, `apps/web/src/app/icon.tsx`, `apps/web/src/app/apple-icon.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**

- Consumes: Task 1의 matcher 제외
- Produces: `/manifest.webmanifest`, `/icon/192`·`/icon/512`(또는 Next가 정하는 경로), `/apple-icon`

- [ ] **Step 1: 실패하는 테스트** (`manifest.test.ts`)

```ts
it('홈 화면 추가 정보', () => {
  const m = manifest()
  expect(m).toMatchObject({
    name: '벌써 근무표짤 때가 됐어?',
    short_name: '근무표',
    display: 'standalone',
    start_url: '/',
    theme_color: '#0f6e63',
    background_color: '#f6f4ef',
    lang: 'ko',
  })
  expect(m.icons?.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(m.icons?.some((i) => i.purpose === 'maskable')).toBe(true)
})
```

- [ ] **Step 2: 실패 확인** — `pnpm --dir apps/web exec vitest run src/app/manifest.test.ts` → FAIL

- [ ] **Step 3: 구현**
  - 먼저 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`, `app-icons.md`, `01-app/02-guides/progressive-web-apps.md`를 읽는다.
  - `icon.tsx`: `ImageResponse`로 `generateImageMetadata`에 192·512 두 크기. 그림은 `--color-primary` 배경 둥근 사각형에 흰 글자 「근무」(maskable 안전 영역 80% 안). `apple-icon.tsx`: 180×180 같은 그림.
  - `manifest.ts`: 위 테스트 값, `icons`에 icon 두 크기(`purpose: 'any'`)와 512 `maskable`. 경로는 Next가 생성하는 icon URL과 맞춘다(문서 확인).
  - 루트 `layout.tsx`: `export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0f6e63' }`. `metadata`에 `appleWebApp: { capable: true, title: '근무표', statusBarStyle: 'default' }`.

- [ ] **Step 4: 확인** — 단위 PASS. `pnpm --dir apps/web build` 통과. 개발 서버에서 쿠키 없이 `curl -s -o /dev/null -w '%{http_code}' localhost:<port>/manifest.webmanifest` → `200`, `/apple-icon` → `200`

- [ ] **Step 5: 커밋** — `feat(web): 홈 화면에 추가(manifest·아이콘·viewport)`

---

### Task 4: 모바일 근무표 데이터 묶기(순수 함수)

**Files:**

- Create: `apps/web/src/server/schedule/mobile.ts`, `mobile.test.ts`, `apps/web/src/server/doctor/mobile.ts`, `apps/web/src/server/doctor/mobile.test.ts`

**Interfaces:**

- Consumes: `ScheduleView`, `GridRow`, `DayHead` (`server/schedule/view.ts`), `DoctorScheduleView` (`server/doctor/schedule.ts`), `CalDay` (`server/doctor/view.ts`), `SHIFT_TIMES`(`@duty/domain`), `DOCTOR_TIMES`
- Produces (`server/schedule/mobile.ts`, 의사 쪽도 같은 타입을 import해서 쓴다):

```ts
export type MobileChip = 'd' | 'e' | 'n' | 's' | 'off' | 'leave' | 'allday'
export type MyDay = {
  date: IsoDate
  day: number
  red: boolean
  today: boolean
  chip: MobileChip | null
  label: string
}
export type MyMonth = { weeks: (MyDay | null)[][] } // 일요일 시작, 앞뒤 빈칸 null
export type RosterPerson = { id: string; name: string; me: boolean; note: string } // note: 휴가 이름·「S」 등, 없으면 ''
export type RosterGroup = {
  key: 'D' | 'E' | 'N' | 'S' | 'ALLDAY' | 'OFF' | 'LEAVE'
  label: string
  time: string
  people: RosterPerson[]
}
export type DayRosters = Record<IsoDate, RosterGroup[]>
export type TodayCard = {
  dateLabel: string
  code: string
  time: string
  tomorrow: string | null
  summary: string | null
  empty: boolean
}

export function myMonth(view: ScheduleView): MyMonth // 'me' 행이 없으면 모든 칸 chip null
export function dayRosters(view: ScheduleView): DayRosters // 빈 그룹은 뺀다, 순서 D·E·N·S·LEAVE·OFF
export function todayCard(a: { cur: ScheduleView; next: ScheduleView | null; today: IsoDate }): TodayCard
// server/doctor/mobile.ts
export function doctorMyMonth(view: DoctorScheduleView): MyMonth
export function doctorRosters(view: DoctorScheduleView): DayRosters // D·N 또는 ALLDAY, 빈 날은 []
export function doctorTodayCard(view: DoctorScheduleView, today: IsoDate): TodayCard
```

- [ ] **Step 1: 실패하는 테스트** — 손으로 만든 작은 `ScheduleView`(3명 × 10월 28~31일 + 11월 1일짜리 다음 달)로:

```ts
it('내 달력: 10월 1일은 목요일 → 첫 주 앞 4칸 null', () => {
  const w = myMonth(oct).weeks
  expect(w[0].slice(0, 4)).toEqual([null, null, null, null])
  expect(w[0][4]?.date).toBe('2026-10-01')
})
it('내 달력: 내 칸 chip·label, 오늘 표시는 DayHead.today', () =>
  expect(find(myMonth(oct), '2026-10-28')).toMatchObject({ chip: 'e', label: 'E', today: true }))
it('내 행이 없으면 chip null', () => expect(find(myMonth(withoutMe), '2026-10-28')?.chip).toBeNull())
it('날짜별 명단: D·E·N·OFF 묶음과 나 표시', () =>
  expect(dayRosters(oct)['2026-10-28']).toEqual([
    {
      key: 'D',
      label: 'D',
      time: '07:00–15:30',
      people: [{ id: 'u2', name: '윤채원', me: false, note: '' }],
    },
    { key: 'E', label: 'E', time: '14:30–23:00', people: [{ id: 'u1', name: '정하늘', me: true, note: '' }] },
    { key: 'OFF', label: '쉬는 사람', time: '', people: [{ id: 'u3', name: '배지현', me: false, note: '' }] },
  ]))
it('휴가는 LEAVE 묶음에 휴가 이름', () =>
  expect(dayRosters(oct)['2026-10-29'].find((g) => g.key === 'LEAVE')?.people[0].note).toBe('연차'))
it('오늘 카드', () =>
  expect(todayCard({ cur: oct, next: null, today: '2026-10-28' })).toEqual({
    dateLabel: '오늘 10/28 (수)',
    code: 'E',
    time: '14:30–23:00',
    tomorrow: '내일 N 22:30–',
    summary: '이번 달 OFF 9 · 누적 OFF +4',
    empty: false,
  }))
it('월말 내일은 다음 달에서', () =>
  expect(todayCard({ cur: oct, next: nov, today: '2026-10-31' }).tomorrow).toBe('내일 off'))
it('월말인데 다음 달 근무표가 없으면 내일 없음', () =>
  expect(todayCard({ cur: oct, next: null, today: '2026-10-31' }).tomorrow).toBeNull())
it('근무표가 없으면 empty', () =>
  expect(todayCard({ cur: emptyView, next: null, today: '2026-10-28' })).toMatchObject({
    empty: true,
    code: '—',
  }))
```

의사 쪽은 `DoctorScheduleView` 작은 픽스처로: 내 D·N·올데이 chip, `doctorRosters`가 D/N 각 1명 또는 ALLDAY 1명, `doctorTodayCard`의 오늘·다음 근무(`calendar.next` 사용).

- [ ] **Step 2: 실패 확인** — `pnpm --dir apps/web exec vitest run src/server/schedule/mobile.test.ts src/server/doctor/mobile.test.ts` → FAIL

- [ ] **Step 3: 구현** — `GridCellView.chip`을 그대로 `MobileChip`에 쓰고 `chip === 'leave'`면 label을 note로. 시간은 `SHIFT_TIMES`/`DOCTOR_TIMES`. 오늘 카드의 `code`·`time`·`summary`는 `cur.cards`(`todayCode`·`todayTime`·`offCount`·`accText`)에서, 내일은 `cur`의 me 행 다음 날 칸 또는 `next`의 첫 날 칸에서 `「내일 {label} {start}–」`(OFF·휴가는 시간 없이 `내일 off`/`내일 연차`). `dateLabel`은 `cards.todayLabel`.

- [ ] **Step 4: 통과 확인** — 같은 명령 PASS

- [ ] **Step 5: 커밋** — `feat(web): 모바일 근무표용 내 달력·날짜별 명단·오늘 카드 묶기`

---

### Task 5: 모바일 근무표 화면(간호사·의사)

**Files:**

- Create: `apps/web/src/components/mobile/MobileSchedule.tsx`, `apps/web/src/server/schedule/mobile-home.ts`
- Modify: `apps/web/src/app/(app)/page.tsx`, `apps/web/src/app/(doctor)/doctor/page.tsx`

**Interfaces:**

- Consumes: Task 4 전부, `requestDevice`, `loadMonthView`, `buildScheduleView`, `loadDoctorSchedule`, `shiftYm`(`server/schedule/month`)
- Produces:
  - `export async function loadTodayCard(db: Db, a: { viewerId: string; today: IsoDate; shown?: { year: number; month: number; view: ScheduleView } }): Promise<TodayCard>` — `shown`이 오늘 달이면 다시 읽지 않는다. 오늘이 그 달 말일일 때만 다음 달을 읽는다.
  - `MobileSchedule` props:

```ts
{
  title: string; prevHref: string; nextHref: string
  card: TodayCard
  mine: MyMonth
  groups: { key: 'nurse' | 'doctor'; label: '간호사' | '의사'; rosters: DayRosters }[] // 첫 항목 = 내 직군
  tab: 'mine' | 'all'; date: IsoDate // 초기 선택 날짜
  tabHref: (t: 'mine' | 'all') => string // 서버에서 문자열 두 개로 넘긴다: mineHref, allHref
  footer?: React.ReactNode // 근무 시간 안내 등
}
```

(함수는 서버→클라이언트로 못 넘기므로 실제 props는 `mineHref`·`allHref` 문자열이다.)

- [ ] **Step 1: 구현 `MobileSchedule`(클라이언트)** — 시안 `1-home.html` B, `2-team.html` B 그대로:
  - 제목 줄(`‹ 10월 ›` 링크), 오늘 카드(검은 카드: 작은 `dateLabel`, 큰 `code` + `time`, 아래 `tomorrow · summary`; `empty`면 「근무표가 아직 없습니다」).
  - 「내 근무 / 전체」 세그먼트(링크, `aria-current`).
  - `mine`: 7열 달력(일요일 빨강, 공휴일 `red`), 칸에 칩, 오늘 칸 테두리. 칸을 누르면 선택 날짜가 바뀌고 달력 아래에 「{d}일 {label} · 같이 서는 사람: …」(내 묶음의 다른 사람, 쉬는 날이면 「쉬는 날」).
  - `all`: 가로로 넘기는 날짜 띠(선택 날짜를 가운데로 스크롤), 직군이 둘이면 「간호사 / 의사」 전환, 그 날짜의 `RosterGroup` 카드(칩·시간·인원 수·이름, `me`는 굵게 primary).
  - 선택 날짜 상태는 클라이언트 `useState(date)`. 오늘은 props로 받은 값만 쓴다.
- [ ] **Step 2: 간호사 홈 분기** — `(app)/page.tsx`에서 `requestDevice()`가 `mobile`이면: 기존 `loadMonthView`·`buildScheduleView`로 `view`, `loadTodayCard`, `searchParams.tab`(`all`이면 all), `searchParams.date`(그 달 날짜면 그 날, 아니면 오늘이 그 달이면 오늘, 아니면 1일). 의사표 `loadDoctorSchedule(..., forNurse: true)`가 `!hidden`이면 groups에 의사 추가. `NoticeBar`는 카드 위에 그대로 둔다. 데스크톱 경로는 한 줄도 바꾸지 않는다.
- [ ] **Step 3: 의사 홈 분기** — `(doctor)/doctor/page.tsx` 모바일: `doctorMyMonth`·`doctorTodayCard`, groups = [의사 `doctorRosters`, 간호사 `dayRosters(buildScheduleView(loadMonthView(...)))`](간호사표는 늘 보임).
- [ ] **Step 4: 확인** — `typecheck`·`lint`·단위 통과. 데스크톱 회귀 `playwright test e2e/schedule.spec.ts e2e/doctor.spec.ts --project=chromium` PASS. 브라우저 창에서 Pixel 7 크기로 `/`와 `/doctor`를 열어 시안과 비교(스크린샷).
- [ ] **Step 5: 커밋** — `feat(web): 모바일 근무표 — 오늘 카드·내 달력·날짜별 명단`

---

### Task 6: 더보기, 관리(PC 안내), 관리자 화면 PC 안내

**Files:**

- Create: `apps/web/src/components/mobile/PcOnly.tsx`, `apps/web/src/app/(app)/more/page.tsx`, `apps/web/src/app/(doctor)/doctor/more/page.tsx`, `apps/web/src/app/(app)/manage/page.tsx`, `apps/web/src/app/(doctor)/doctor/manage/page.tsx`, `apps/web/src/app/(doctor)/doctor/admin/layout.tsx`
- Modify: `apps/web/src/app/(app)/admin/layout.tsx`, `apps/web/src/app/(app)/adjust/page.tsx`, `apps/web/src/app/(doctor)/doctor/adjust/page.tsx`, `apps/web/src/app/page-guards.test.ts`

**Interfaces:**

- Consumes: `requestDevice`, `LeaveBalanceCard`, `projectedLeaveBalance`, `logoutAction`, 가드들
- Produces: `PcOnly({ group: 'nurse' | 'doctor' })` — 제목 「PC에서 이용해 주세요」, 설명 「이 화면은 정보가 많아 PC에서 이용해 주세요.」, 목록(듀티 생성 · 생성안 검토 / 근무 조정 (전체 격자 편집·다시 생성) / 규칙 설정 / 간호사 관리 또는 의사 관리), 홈으로 링크

- [ ] **Step 1: 가드 테스트 먼저 고친다** — `page-guards.test.ts` 의사 쪽: `rel.startsWith('doctor/admin/') || rel.startsWith('doctor/manage/')`면 `await requireDoctorAdmin()`. 간호사 쪽: `rel.startsWith('manage/')`면 `await requireAdmin()`. 실행해 새 페이지가 없어 아직 통과하는지 확인 후, 페이지를 만든 뒤 다시 실행.
- [ ] **Step 2: 구현**
  - `/more`(`requireNurse`): 카드 한 열 — 내 정보(이름·병동·사번, 관리자 표시), `LeaveBalanceCard`, 링크 동료 현황 `/peers`·규칙 안내 `/rules`·내 설정 `/settings`, 로그아웃 폼. `/doctor/more`(`requireDoctor`): 내 정보(ID), 규칙 안내·내 설정, 로그아웃.
  - `/manage`(`requireAdmin`)·`/doctor/manage`(`requireDoctorAdmin`): 이번 PR에서는 「PC에서 이용해 주세요」 목록만(`PcOnly` 목록 부분 재사용, 링크 없음). 휴가 승인·급한 변경은 3차 PR.
  - `(app)/admin/layout.tsx`: `requireAdmin()` 뒤 `device === 'mobile'`이면 `<PcOnly group="nurse" />`. 새 `(doctor)/doctor/admin/layout.tsx`도 같게(`requireDoctorAdmin`, `group="doctor"`).
  - `/adjust`: 관리자이고 모바일이면 `<PcOnly group="nurse" />`. `/doctor/adjust`: 관리자이고 모바일이면 `<PcOnly group="doctor" />`.
- [ ] **Step 3: 확인** — `vitest run src/app/page-guards.test.ts` PASS, `typecheck`·`lint`. 데스크톱 회귀 `playwright test e2e/admin.spec.ts e2e/adjust.spec.ts --project=chromium` PASS.
- [ ] **Step 4: 커밋** — `feat(web): 모바일 더보기·관리 탭과 관리자 화면 PC 안내`

---

### Task 7: 모바일 E2E

**Files:**

- Modify: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/mobile/shell.spec.ts`

**Interfaces:**

- Consumes: `NURSE`, `ADMIN`, `loginAndWait`, `waitHydrated`, `setToday` (`e2e/fixtures.ts`), `E2E_TODAY = '2026-10-13'`

- [ ] **Step 1: 설정** — `chromium` 프로젝트 `testIgnore: ['cycle/**', 'mobile/**']`. 새 프로젝트 `{ name: 'mobile', testMatch: 'mobile/**/*.spec.ts', dependencies: ['chromium'], use: { ...devices['Pixel 7'], ...channel } }`(크로미움 기반, 모바일 UA·터치). `cycle-reset`의 `dependencies`를 `['chromium', 'mobile']`로.
- [ ] **Step 2: 테스트 작성** (`shell.spec.ts`)

```ts
test('간호사: 아래 탭, 오늘 카드, 내 달력, 같이 서는 사람', async ({ page }) => {
  await loginAndWait(page, NURSE.employeeNo)
  await waitHydrated(page)
  const tabs = page.getByRole('navigation', { name: '아래 탭' })
  for (const t of ['근무표', '신청', '교환', '더보기'])
    await expect(tabs.getByRole('link', { name: t })).toBeVisible()
  await expect(page.getByText('오늘 10/13 (화)')).toBeVisible()
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
test('전체: 날짜별 명단에서 나 강조', async ({ page }) => {
  /* /?tab=all&date=2026-10-13 → 「쉬는 사람」 등 묶음과 정하늘 강조 */
})
test('관리자: 관리 탭, 듀티 생성은 PC 안내', async ({ page }) => {
  /* ADMIN 로그인 → 탭에 관리, /admin/generate → 「PC에서 이용해 주세요」 */
})
test('로그인 화면 한 열', async ({ page }) => {
  /* /login → 폭 넘침 없음, 사번·비밀번호 입력 보임 */
})
test('홈 화면 추가 파일은 로그인 없이 200', async ({ request }) => {
  for (const p of ['/manifest.webmanifest', '/apple-icon'])
    expect((await request.get(p, { maxRedirects: 0 })).status()).toBe(200)
})
```

전체 명단 기대값은 시드 10/13 근무에서 정한다(실행해 확인한 뒤 고정, 실명 없음 확인). 의사 모바일 홈 한 건도 추가(의사 시드 계정은 `doctor.spec.ts`의 것을 쓴다).

- [ ] **Step 3: 실행** — scratchpad worktree에서 `pnpm --dir apps/web exec playwright test --project=mobile` PASS, 이어서 전체 `pnpm --dir apps/web exec playwright test` PASS(데스크톱 회귀 포함)
- [ ] **Step 4: 커밋** — `test(web): 모바일 셸·근무표 E2E`

---

### Task 8: 마무리와 PR

- [ ] `pnpm format:check`(실패하면 `prettier --write` 후 `style:` 커밋), `typecheck`, `lint`, `test`, `test:int`, `build` 모두 통과
- [ ] `python3 .local/check-privacy.py` → `hits 0`
- [ ] waypoint `12-mobile.md`에 「구현 결과 (1차 PR)」 절(만든 것·편차), STATUS 배너 갱신 → waypoint master 커밋·push → duty 포인터 커밋
- [ ] 브랜치 push, PR 생성(본문 끝 「🤖 Generated with [Claude Code](https://claude.com/claude-code)」), CI 확인

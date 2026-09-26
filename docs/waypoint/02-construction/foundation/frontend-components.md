---
artifact: frontend-components
build-spec: foundation
status: READY
updated: 2026-09-26
---

# Frontend Components — 2-1 Foundation

> 디자인 SoT: 핸드오프 README「Design Tokens」「공통 셸」「S1」, 프로토타입 `id="1d"`(로그인)·`id="1c"`의 `<nav>`.
> 수치는 프로토타입 인라인 스타일에서 그대로 옮긴다. 흐름은 [`business-logic-model.md`](business-logic-model.md).

## 1. 컴포넌트 트리

```
RootLayout (html lang=ko, Pretendard, body bg app)
├── (auth)/login/page         LoginScreen
│   ├── LoginHero             좌측 다크 패널
│   └── LoginForm             우측 폼 (client, useActionState)
├── (auth)/password/page      PasswordScreen (LoginHero 재사용 + PasswordForm)
└── (app)/layout              AppShell (requireUser)
    ├── Sidebar
    │   ├── Logo
    │   ├── NavItem × n
    │   ├── NavSectionLabel "관리자"
    │   ├── NavItem × 4 | NoPermission
    │   ├── NavItem "내 설정"
    │   └── UserBlock (+ 로그아웃)
    └── main → children
        ├── page (/)                 Placeholder "근무표 — 2-3에서 구현"
        ├── requests|leave|peers|rules|settings   Placeholder / 설정은 PasswordForm(자발적 변경)
        └── admin/layout (requireAdmin) → generate|adjust|staff|rules  Placeholder
```

## 2. 컴포넌트 상세

### `LoginHero` (server)
- **역할:** 1d 좌측 패널. props `{ requestDeadlineDay: number, negotiationStartDay: number, negotiationEndDay: number }`(현재 RuleVersion에서 로드).
- 스타일: bg `ink`, color #fff, padding 56, flex column space-between.
  - 상단 "동부시립병원 · 간호부" 14px `ink-3`.
  - 중앙 gap 18: 제목 "벌써 근무표<br>짤 때가 됐어?" 56px/800/-.03em/lh 1.1 · 설명 16px `ink-5` lh 1.6 max-w 460 — 문구는 1d 원문 그대로.
  - 하단 gap 24, 13px `ink-3`: "오프 신청 마감 매월 {requestDeadlineDay}일" · "협의 수정 ~{negotiationEndDay}일".

### `LoginForm` (client)
- **역할:** 1d 우측 폼. `useActionState(login)`.
- 레이아웃: padding 56 48, flex column center, gap 22.
  - 헤더 gap 4: "로그인" 22px/700/-.02em · "사번과 비밀번호를 입력해 주세요." 14px `ink-2`.
  - `TextField` 사번(`inputMode="numeric"`, `autoComplete="username"`) · 비밀번호(`type=password`, `autoComplete="current-password"`): 라벨 13px/600 gap 6, input h46 border `line` radius 10 padding 0 14 15px bg #fff.
  - 체크박스 "이 기기에서 로그인 유지" 13px `ink-2`, 16×16, accent `primary`, **기본 체크**(1d).
  - 버튼 "로그인" h48 bg `primary`(hover `primary-hover`) #fff radius 10 15px/700. 제출 중 `disabled` + "로그인 중…".
  - 하단 flex space-between 13px: 버튼형 링크 "비밀번호를 잊으셨나요?" · "계정은 관리자가 발급합니다" `ink-2`.
- **로컬 상태:** `showForgot: boolean` — 링크 클릭 시 폼 아래에 안내 박스(bg `panel`, border `line-soft`, radius 8, 13px): "관리자(수간호사)에게 비밀번호 재발급을 요청해 주세요."
- **오류 표시:** 폼 위 박스 bg `danger-bg`, color `danger-ink`, radius 8, padding 10 12, 13px, `role="alert"`. 필드 오류는 해당 input border `danger` + 아래 12px 문구.

### `PasswordForm` (client)
- props `{ mode: 'forced' | 'voluntary', employeeNo: string }`
- forced: 헤더 "새 비밀번호를 설정해 주세요" 22px/700 + "임시 비밀번호로 로그인하셨습니다. 앞으로 사용할 비밀번호를 정해 주세요." 14px `ink-2`. 필드: 새 비밀번호·확인.
- voluntary(`/settings`): 흰 카드(radius 12, border `line`, padding 24, max-w 420) 안에 현재·새·확인 3필드.
- 버튼 "저장" h48 primary. 안내 12px `ink-2`: "8자 이상, 사번과 다른 비밀번호".
- 입력 스타일은 LoginForm과 같다.

### `AppShell` (server)
- grid `184px 1fr`, `min-h-screen`, `min-w-[1280px]`, bg `app`.

### `Sidebar` (server + 로그아웃만 client form)
- `<nav>` bg #fff, border-right `line-nav`, padding 20 12, flex column gap 2, `sticky top-0 h-screen`.
- `Logo`: padding 4 10 16, 15px/800/-.02em lh 1.3, "벌써 근무표<br>짤 때가 됐어?".
- `NavItem` props `{ href, label, active, disabled? }`: padding 9 10, radius 8, 13.5px. 활성: bg `primary-soft`, color `primary`, 700. 비활성: color `nav-ink`. hover: bg `panel`. `disabled`(2차 범위)는 링크로 이동하되 라벨 옆 10px `ink-3` "준비 중".
- 메뉴 순서: 근무표(`/`) · 근무 신청(`/requests`) · 휴가 신청(`/leave`, 준비 중) · 동료 현황(`/peers`, 준비 중) · 규칙 안내(`/rules`, 준비 중)
  → `NavSectionLabel` "관리자"(padding 14 10 4, 11px `ink-3` letter-spacing .06em 600)
  → admin: 듀티 생성(`/admin/generate`) · 근무 조정(`/admin/adjust`) · 간호사 관리(`/admin/staff`) · 규칙 설정(`/admin/rules`) / nurse: `NoPermission`(padding 6 10, 12px `ink-4`, "권한 없음")
  → 내 설정(`/settings`).
- 활성 판정: `usePathname()`이 필요하므로 NavItem 목록은 작은 client 컴포넌트로 둔다. `/`는 정확히 일치할 때만 활성.
- `UserBlock`: `margin-top:auto`, padding 12 10, border-top `line-nav`, gap 2. 이름 13px/600(+ admin이면 옆에 "관리자" 11px `admin`). "응급실 · 사번 {employeeNo}" 12px `ink-2`. 그 아래 "로그아웃" 12px `ink-3` 텍스트 버튼.

### `Placeholder`
- props `{ title, stage }`. main padding 24 28. 제목 22px/700/-.02em + 흰 카드(radius 12, border `line`, padding 24) "이 화면은 {stage}에서 구현됩니다." 13px `ink-2`.

### `Forbidden` (`forbidden.tsx`, Next 16 `forbidden()`)
- 셸 안에서 제목 "권한이 없습니다" + "관리자만 볼 수 있는 화면입니다." + "근무표로 돌아가기" 보조 버튼(h36, border `line`, bg #fff, radius 8).

## 3. 전역 · 공유 상태

| 상태 | 소스 | 읽기 |
|---|---|---|
| 현재 사용자 | `getSession()`(서버, 요청 캐시) | AppShell → Sidebar·UserBlock (props로 전달) |
| 현재 규칙(로그인 문구) | `getCurrentRules(wardId)`(서버) | LoginHero |

클라이언트 전역 스토어는 2-1에 두지 않는다(TanStack Query는 2-3에서 도입).

## 4. 화면 상태

| 화면 | 상태 | UI |
|---|---|---|
| 로그인 | 제출 중 | 버튼 disabled + "로그인 중…" |
| 로그인 | 실패·잠금·서버 오류 | 오류 박스(business-rules 문구) |
| 로그인 | DB에 규칙 없음(부트스트랩 전) | LoginHero 하단 문구를 기본값(15일·20일)으로 표시 |
| 비밀번호 변경 | 검증 실패 | 필드 오류 |
| 셸 | 정상 | 메뉴 + 자리표시 |
| 관리자 경로 | 간호사 접근 | Forbidden |

## 5. 상호작용 · 네비게이션

- 미인증 → `/login?next=…` → 성공 → `next` 또는 `/`.
- 첫 로그인 → `/password` → 저장 → `/`.
- 로그인 상태에서 `/login` 접근 → `/`.
- 로그아웃 → `/login`.
- Enter 키 제출, 사번 필드 자동 포커스, 탭 순서: 사번 → 비밀번호 → 로그인 유지 → 로그인.

## 6. 디자인 SoT 매핑 — 토큰 (`apps/web/src/styles/globals.css`, Tailwind v4 `@theme`)

| 토큰 | 값 | SoT |
|---|---|---|
| `--color-canvas` | #E9E6DF | 배경(캔버스) — 앱에서는 쓰지 않음(디자인 캔버스 전용) |
| `--color-app` | #F6F4EF | 앱 배경 |
| `--color-surface` | #FFFFFF | 카드/사이드바 |
| `--color-panel` | #FAF9F6 | 옅은 패널 |
| `--color-weekend-cell` / `--color-weekend-head` | #F3F1EC / #EEECE6 | 주말 열 |
| `--color-ink` · `ink-2` · `ink-3` · `ink-4` · `ink-5` | #1B1F1E · #6B7270 · #9AA09D · #B5BAB7 · #C9C5BC | 텍스트 계열 |
| `--color-nav-ink` | #3A403E | 비활성 메뉴 |
| `--color-line` · `line-soft` · `line-nav` | #D9D5CC · #EEECE6 · #E4E1DA | 보더 |
| `--color-primary` · `primary-hover` · `primary-soft` | #0F6E63 · #0B564D · #DDEFEB | 프라이머리 |
| `--color-danger` · `danger-bg` · `danger-ink` · `danger-row` | #C8321E · #FDECEA · #8A1F12 · #FFF7F5 | 신청/경고 |
| `--color-admin` · `admin-soft` · `admin-row` | #1F5AA6 · #EEF3FB · #F7FAFE | 관리자 |
| `--color-warn-bg` · `warn-ink` · `warn-dot` | #FBE7B5 · #6B4300 · #D99A1E | 주의 |
| `--color-shift-d/e/n/off/s/al` | #FBE7B5 / #CFE8E3 / #D9D6F2 / #EEECE6 / #F7D9E3 / #DDEFEB | 근무 칩(글자 모두 ink) |
| `--radius-frame/card/control/chip` | 14 / 10~12 / 8~10 / 5~6 px | 간격·형태 |
| `--shadow-frame` | 0 1px 2px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.08) | |
| `--shadow-popover` | 0 16px 40px rgba(0,0,0,.18) | |
| `--font-sans` | "Pretendard Variable", -apple-system, sans-serif + antialiased | 타이포 |

| SoT 디자인 요소 | 컴포넌트 |
|---|---|
| 1d 좌측 다크 패널 | LoginHero |
| 1d 우측 폼 | LoginForm |
| 1c `<nav>` 로고·메뉴·사용자 블록 | Sidebar·Logo·NavItem·UserBlock |
| 공통 셸 grid `184px 1fr` | AppShell |

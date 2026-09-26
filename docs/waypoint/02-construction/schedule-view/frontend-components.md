---
artifact: frontend-components
build-spec: schedule-view
status: DRAFT
updated: 2026-09-27
---

# Frontend Components — 2-3 근무표 조회

> 수치는 프로토타입 `id="1c"` 인라인 스타일과 스타일 JS(600~665행)에서 옮긴다. 토큰은 2-1 `globals.css`.

## 1. 컴포넌트 트리

```
AppShell (v2)  Sidebar: NavList(재구성) · LeaveBalanceCard · UserBlock
(app)/page.tsx  SchedulePage (server)
├── ScheduleHeader        ‹ 제목 › · 배지 · 다음 달 링크 · 범례 · PrintButton(client)
├── SummaryCards          5열 카드 (cards 없으면 안내)
├── ScheduleGrid          격자 카드 (empty면 EmptyState)
│   ├── DayHeader × 2행
│   └── GridRowView × n → CellChip × days
├── ScheduleFooter        하단 안내
└── PrintTitle            인쇄 전용 제목
```

## 2. 컴포넌트 상세

### `SchedulePage`
- main padding 18 16, flex column gap 12, `min-w-0`.

### `ScheduleHeader`
- flex center gap 12.
- 월 이동: `‹` `›`는 `<Link href="/?ym=…">` 28×28, border `line`, bg #fff, radius 7, 14px, `aria-label` "이전 달"/"다음 달". 제목 20px/700/-.02em.
- 배지: 확정 bg `primary-soft` color `primary` 12px/600 padding 3 8 radius 999. 마감은 bg `line-soft` color `ink-2`.
- 다음 달 링크: 12px `primary` 밑줄 "11월 근무표 확정됨 →".
- 범례(`margin-left:auto`, gap 6, 12px): 칩 D/E/N/OFF/S(padding 3 8, radius 5, 700, 각 `shift-*` 배경, 글자 `ink`) + `ink-2` "□ 신청"(14×14 radius 4 inset 1.5px `danger`) "□ 관리자 수정"(inset 2px `admin`).
- `PrintButton`(client): h32 padding 0 12 border `line` bg #fff radius 8 13px "인쇄" → `window.print()`.

### `SummaryCards`
- grid 5열 `minmax(0,1fr)` gap 8. 카드 radius 10 padding 10 14 flex column gap 2.
- 1번: bg `ink` color #fff. 라벨 11px opacity .7 "오늘 10/1 (목)", 값 22px/700 "N" + 12px/500 opacity .75 "22:30–07:30".
- 2~5번: bg #fff border `line`. 라벨 11px `ink-2`, 값 22px/700, 보조 12px/500 `ink-2`.
  - 이번달 OFF: "10" + " / 기준 11"
  - 누적 OFF (이월 포함): "+4" + 보조 "다음 달 반납 4" (값 색 `ink`, Q1)
  - 잔여 나이트: "3" + " + 이번달 8 → 슬리핑오프 1"
  - 연차 / 특휴: "9" + " / 2"
- 로그인 사용자 행이 없으면 카드 대신 흰 카드 13px `ink-2` "이 달에는 근무 기록이 없습니다".

### `ScheduleGrid`
- 카드 bg #fff border `line` radius 10 overflow hidden. 내부 CSS grid `gridTemplate`, 11px. 가로 스크롤 없음(31일 = 1054px).
- 헤더 고정 칸(성명·이월 off·이월 N·누적 off·ⓝN·특휴 개원·검진·보): `grid-row: span 2`, border-right/bottom `line`, bg `panel`, `ink-2`, 두 줄 라벨 lh 1.2. "보"는 border-right 없음.
- 날짜 행: h18, border-right·bottom `line-soft`, 빨간 날 bg `weekend-head` + 700, 아니면 bg `panel`.
- 요일 행: h18, 10px, border-bottom `line`, 색 R-VIEW-8.
- 성명 칸: h32, padding-left 8, 600, border-right `line`, border-bottom `line-soft`. head → `admin` 색. me → 800 + bg `primary-soft` + `box-shadow: inset 3px 0 0 primary`.
- 숫자 칸: h32 center `ink-2`, border-right `line`, border-bottom `line-soft`, me면 bg `primary-soft`. 누적 off: border-left `line` + 700 `ink`.
- `CellChip` 래퍼: h32 center, border-right·bottom `line-soft`, 빨간 날 bg `weekend-cell`, `title`. 칩: 20×20 radius 5 700, 10.5px(off는 8.5px), 배경 `shift-*`(휴는 `shift-leave` #D8E6C3), outline admin `inset 0 0 0 2px admin` / requested `inset 0 0 0 1.5px danger`. 검진 반차: 칩 오른쪽 위 4×4 원 `ink-2`.

### `EmptyState`
- 격자 자리의 흰 카드 padding 32 center, 14px `ink-2`: "2026년 9월 근무표가 아직 확정되지 않았습니다." 관리자 + 생성 중이면 아래에 보조 버튼 링크 "듀티 생성에서 생성안 보기"(`/admin/generate`).

### `ScheduleFooter`
- 12px `ink-2`. R-VIEW-17 문구.

### `LeaveBalanceCard` (server, 모든 화면)
- 위치: 사이드바 `margin-top:auto` 영역, UserBlock 위, gap 8.
- 카드 bg `panel` border `line-soft` radius 10 padding 10 12, flex column gap 5, 12px.
- 제목 11px `ink-3` letter-spacing .06em 600 "내 휴가 잔여". 행: flex space-between, 라벨 `ink-2`, 값 `<b>`.
- 행: 연차 "9 / 15" · 특별휴가 "2 / 2" · 검진 반차 "0.5" · 병가 "60" · 누적 OFF "+4"(색 없음) · 잔여 N "3".
- UserBlock은 padding 10 10 0, border-top `line-nav`(v2), 로그아웃 버튼은 유지한다.

## 3. 상태

서버 컴포넌트뿐이며 클라이언트 상태는 없다. 월 이동은 링크(전체 서버 렌더).

## 4. 화면 상태

| 상태 | UI |
|---|---|
| 확정 | 배지 "확정 · 담당 {이름}" + 격자 |
| 마감 | 배지 "마감 · 담당 {이름}" + 격자 |
| 없음·신청 중·생성 중 | EmptyState (관리자 + 생성 중이면 링크) |
| 로그인 사용자 행 없음 | 카드 자리 안내 |

## 5. 인쇄

- `@media print`: 사이드바(`nav`), 헤더 컨트롤, 요약 카드, 하단 문구 숨김. `PrintTitle`("2026년 10월 · 응급실 근무표", 14px/700)만 격자 위에 표시.
- `@page { size: A4 landscape; margin: 8mm }`. 격자 폭 1054px가 A4 가로 인쇄 영역(약 1060px)을 넘지 않도록 `zoom: .95`.
- 칩 배경이 인쇄되도록 `print-color-adjust: exact`.

## 6. 디자인 SoT 매핑

| 1c 요소 | 컴포넌트 |
|---|---|
| 헤더 ‹ 제목 › · 배지 · 범례 · 인쇄 | ScheduleHeader |
| 요약 카드 5열 | SummaryCards |
| 격자 `68px 36px 36px repeat(31,24px) 34px×5` | ScheduleGrid |
| `hdStyleB`·`wdStyleB`·`c.wrap`·`c.style`·`nameStyle`·`numStyle`·`accStyle` | DayHeader·CellChip·GridRowView |

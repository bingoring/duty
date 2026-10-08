---
artifact: frontend-components
build-spec: peers-rules
status: READY
updated: 2026-10-08
---

# Frontend Components — 2-10 동료 현황·규칙 안내

> 수치는 프로토타입 `id="1h"`(L729–748, 로직 L1107–1114)·`id="1l"`(L904–937, 로직 L1140–1143). 토큰은 2-1 `globals.css`.

## 1. 컴포넌트 트리

```
(app)/peers/page.tsx   PeersPage (server)      requireUser → requestToday → loadMonthView → buildPeersView
├── PeersHeader        ‹ 제목 › · 설명 · "정렬: 누적 OFF ↑"
└── PeersTable         grid 표 또는 빈 상태
(app)/rules/page.tsx   RulesGuidePage (server) requireUser → getCurrentRules → buildRulesGuide
├── GuideToc (client)  목차 7개, 스크롤 연동 활성
└── GuideSection × 7   제목 · (첫 섹션) ShiftCards · RuleList
```

## 2. 상세

### PeersPage / PeersHeader
- main padding 24 28, flex column gap 16.
- 제목 22px/700 "동료 현황 · 2026년 10월", 양옆 ‹ › 링크(근무표 헤더와 같은 버튼, `?ym=`). 설명 13px `ink-2` "누적 OFF가 낮을수록, 잔여 N이 높을수록 다음 달 오프 배정 우선순위가 높습니다." 우측 13px `ink-2` "정렬: 누적 OFF ↑".

### PeersTable
- 카드: bg surface, 1px `line`, radius 12, 13px. `role="table"`, `aria-label="동료 현황"`.
- grid `1.4fr 1fr 1fr 1fr 1fr 1fr 1.4fr`. 헤더 행 padding 10 16, bg `panel`, 12px `ink-2`: 성명 | 이번달 OFF | 누적 OFF | 이번달 N | 잔여 N | 슬리핑오프 | 주말 연휴 OFF.
- 데이터 행 padding 12 16, 하단 1px `line-soft`, `role="row"` `aria-label={이름}`. 내 행 bg `primary-soft`. 성명 600 + "나" pill(10px, bg `primary`, 흰 글자, padding 1 6, radius 999). 누적 OFF 700. 주말 연휴 OFF `ink-2`.
- 빈 상태: 근무표 EmptyState와 같은 카드에 R-PEER-3 문구.
- 좁은 화면: 표 컨테이너 `overflow-x-auto`, 최소 폭 720px.

### RulesGuidePage
- main padding 24 28, grid `200px 1fr`, gap 24. 좁은 화면(<900px)에서는 목차를 위로 접어 가로 스크롤 칩.
- 우측 상단 12px `ink-3` "규칙 버전 v{n} · {M/D} 저장"(R-GUIDE-1).

### GuideToc (client)
- 13px, gap 2, sticky top. 항목 padding 8 10, radius 8. 활성: bg `primary-soft`, `primary`, 600. 비활성 `ink-2`.
- `<a href="#{id}">`. IntersectionObserver로 화면 위쪽에 걸린 섹션을 활성으로.

### GuideSection
- `<section id>` + 제목 22px/700(letter-spacing −.02em). 섹션 사이 gap 28.
- ShiftCards(첫 섹션만): grid `repeat(4,1fr)` gap 10, 카드 radius 12 padding 16, 배경 = 칩 토큰(`shift-d/e/n/s`). 글자 26px/800, 시간 13px/600, 설명 12px.
- RuleList: bg surface, 1px `line`, radius 12, padding 6 18, 14px. 행 flex gap 14 padding 12 0, 하단 1px `line-soft`. 번호 12px `ink-3` 폭 22(섹션마다 1부터). 본문 flex-1 lh 1.5. 태그 11px/700 padding 3 8 radius 999(R-GUIDE-3).
- 경조휴가 항목은 본문 아래 2열 작은 표(사유 · 일수).

## 3. 셸
- `nav-items.ts`에서 `/peers`·`/rules`의 `pending` 해제("준비 중" 꼬리표 제거).

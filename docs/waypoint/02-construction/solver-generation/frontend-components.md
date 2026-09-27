# frontend-components — 2-6 S8 듀티 생성 (1i + 격자 미리보기)

SoT: 핸드오프 v4 README S8, 프로토타입 `id="1i"`(1280×810). 치수·색은 프로토타입 인라인 값 그대로.

## §1. 트리

```
app/(app)/admin/generate/page.tsx        서버: adminOnly 레이아웃(기존) · ?ym=(기본: 생성 가능한 가장 가까운 달, 없으면 다음 달) · ?c=후보
└ GenerateScreen (client, data-hydrated)
  main: grid 320px 1fr, gap 20, padding 24px 28px
  ├ aside (gap 12)
  │ ├ h1 "11월 듀티 생성" 22px/700, tracking -.02em
  │ ├ HardCard "필수 조건"  (bg #fff, border line, radius 12, p 16, gap 12, 13px)
  │ │   행: 라벨 ↔ 값 칩(border line, radius 6, px 10 py 4, 600) — 듀티당 최소 인원 N명 · K-tass 권한자 포함 N명 이상 ·
  │ │   월 나이트 상한 N개 · 연속 나이트 ≤ N일 · 근무 간 휴식 ≥ N시간 / 12px ink-2 "금지 패턴 E-D · N-E · … 자동 차단"
  │ ├ PriorityCard "우선 반영" (gap 10) — checkbox accent primary:
  │ │   근무 신청 · 연차 (N건, 코멘트 M) / N 후 OFF 2개 (불가피 시 N-OFF-E) / 모든 간호사 월 1회 주말 이틀 통 OFF /
  │ │   저연차만 배정 방지 / 특정 근무자 반복 겹침 최소화 / 프리셉터–신규 동일 근무 (이름·이름) [checked, disabled, "필수"]
  │ │   트레이닝이 없으면 마지막 줄은 "프리셉터–신규 동일 근무 (해당 없음)"
  │ ├ 버튼 행 gap 8: "↻ 리롤"/"생성"(보조: flex 1, h 46, border, radius 10, 14px/600) · "이 안으로 확정"(주요: flex 1.4, h 46, primary, 700)
  │ │   생성 중: 보조 버튼 "생성 중… (최대 20초)" + 비활성, 확정 비활성
  │ │   마감 전(Q1): 두 버튼 비활성 + 아래 12px ink-2 blockedReason
  │ └ 확정 완료 상태: 버튼 대신 "11월 근무표를 확정했습니다 · 근무표 보기 →"
  └ ResultPane (gap 12, min-w 0)
    ├ 헤더 13px: "생성 결과 · N번째 안"(15px/700) ‹ › (28×28 보조 버튼, 이전/다음 안) · ink-2 "10:42 생성" ·
    │   ml-auto 배지 "필수 규칙 위반 0"(primary-soft/primary, px 10 py 4, radius full, 600) · "권고 미충족 K"(warn-bg/warn-ink)
    │   stale이면 배지 옆 danger "입력이 바뀜 · 다시 생성 필요"
    ├ 경고 띠(있을 때): 전월 미확정(R-GEN-13) — bg panel, 12px ink-2, radius 8
    ├ CheckList (bg #fff, border, radius 12, p 14, gap 8, 13px)
    │   행: 점 8px(통과 primary / 미충족 warn-dot) + 제목 700 + 설명 ink-2, 행 사이 border-bottom line-soft, py 8
    │   순서: 통과 항목(인원·K-tass / 신청 반영) → OFF 부족자(A3, 미충족 색) → 권고 미충족(formatViolation)
    ├ SummaryTable "간호사별 배정 요약" (bg #fff, border, radius 12, p 14, gap 10)
    │   grid 1.2fr repeat(6,1fr): 성명 | D | E | N | OFF | 누적 OFF 후 | 잔여 N 후 — 헤더 12px ink-2, 행 13px py 6 border-top line-soft
    │   누적 OFF 후: 700, 음수 danger / 양수 primary / 0 기본, 부호 표시(2-3 규칙)
    └ PreviewGrid (Q2) — 2-3 `ScheduleGrid` 재사용(읽기 전용), 신청 반영 칸 빨간 외곽선, 권고 미충족 칸 warn 점
  빈 상태(후보 없음): 우측에 "아직 생성한 안이 없습니다. 조건을 확인하고 「생성」을 누르세요."
  실패 상태: 우측 상단 danger 박스 "해를 찾지 못했습니다" + 원인 목록(최대 5) + "조건을 바꾸거나 근무 조정에서 휴가·신청을 확인하세요"
```

## §2. 상호작용

| 동작 | 결과 |
|---|---|
| 체크박스 토글 | 로컬 상태만. 다음 생성/리롤에 전달(Q4) |
| 생성·리롤 | `generateAction` → 성공 시 `?c=새 후보`로 `router.replace`, 실패 시 실패 상태 |
| ‹ › | `?c=` 이전/다음 후보 (서버 렌더) |
| 이 안으로 확정 | 확인 다이얼로그 "11월 근무표를 N번째 안으로 확정합니다. 확정하면 간호사에게 공개됩니다." → `confirmCandidateAction` |
| 확정 후 | 페이지는 확정 상태(버튼 숨김, 근무표 링크) |

## §3. 접근성·E2E 앵커

- 버튼 이름: "생성", "↻ 리롤", "이 안으로 확정", "이전 안", "다음 안". 결과 영역 `role="region" aria-label="생성 결과"`.
- 체크박스는 `<label>` 포함. 검사 리스트 `role="list"`, 요약 표 `role="table" aria-label="간호사별 배정 요약"`.

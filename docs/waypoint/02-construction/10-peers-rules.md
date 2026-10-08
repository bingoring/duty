---
phase: 02-construction
stage: 10-peers-rules
status: AI_PROPOSED
updated: 2026-10-08
---

# [Stage 2-10] 동료 현황·규칙 안내 (S6·S7)

## 목적

사이드바에 "준비 중"으로 남은 두 메뉴를 배포 전에 채운다. S6은 간호사 전원의 오프·나이트 현황을 한 표로 공개하고(원문 §13), S7은 병동 규칙을 지침 항목별로 보여 주되 수치는 규칙 설정(S11) 값에서 렌더링한다.

## 입력 (Inputs)

- [`../inputs/design-handoff_v5/README.md`](../inputs/design-handoff_v5/README.md) S6(1h)·S7(1l) / 프로토타입 `id="1h"`·`id="1l"`
- [`../inputs/requirements_v3.md`](../inputs/requirements_v3.md) 근무일정표 작성 지침 · 야간근무 운영지침 · 응급실 지침
- 2-3 근무표 잔여 계산(`loadMonthView`·R-VIEW-9~13), 2-4 규칙 설정(`RULE_PARAM_LIMITS`·`RULE_TOGGLE_DEFS`), 2-2 정산(`hasWeekendPair`)
- [`../DECISIONS.md`](../DECISIONS.md) 2026-10-07 「S6·S7 배포 전 2-10」, 2026-10-08 「2-10 (Q1~Q3)」

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-10-08)
- [ ] Build Spec §4 구현 체크리스트 전 항목 완료
- [ ] Build Spec §5 검증 통과 → IMPLEMENTED

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(standard): [`peers-rules/build-spec-index.md`](peers-rules/build-spec-index.md)

요지:
- **S6 동료 현황:** 이번 달 기본 + ‹ › 월 이동. 교대 근무자 전원(수간호사 제외) × 이번달 OFF · 누적 OFF · 이번달 N · 잔여 N · 슬리핑오프 · 주말 연휴 OFF(실제 날짜 또는 "미배정 → 다음 달 우선"). 누적 OFF 오름차순, 내 행 강조. 값은 근무표(S3)와 같은 계산.
- **S7 규칙 안내:** 목차 7개를 모두 채운다. 각 항목은 "자동 적용"(시스템이 강제)·"권고"(생성 때 최대한 반영)·"안내"(시스템이 강제하지 않는 지침) 태그. 수치·금지 패턴·켜고 끄는 규칙은 현재 규칙 버전에서, 경조사 일수·특별휴가 공식 등은 도메인 상수에서 가져온다.
- **S2 초기 설정은 넣지 않는다(Q1).** 초기 잔여치는 관리자가 S10에서 넣는다. 원문 §10·11(본인 입력)과 다른 결정이다.

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 S6 열·S7 항목·태그가 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-10을 `HUMAN_APPROVED`로 업데이트 → R-1 독립 코드 리뷰

---
phase: 02-construction
stage: 08-swap-requests
status: AI_PROPOSED
updated: 2026-09-30
---

# [Stage 2-8] 근무 교환 요청 (S9 간호사, 3a)

## 목적

협의 기간에 간호사가 근무 조정 화면에서 같은 날 여러 명의 근무를 서로 바꾸는 교환 요청을 보내고, 당사자가 모두 수락하면 규칙을 다시 검사해 즉시 근무표에 반영한다.

## 입력 (Inputs)

- [`../inputs/design-handoff_v5/README.md`](../inputs/design-handoff_v5/README.md) S9 간호사 시점(3a) / 프로토타입 `id="3a"`
- 2-2 검사기, 2-7 편집·수정 이력·바뀐 근무 안내
- [`../DECISIONS.md`](../DECISIONS.md) 2026-09-30 「2-8 근무 교환 요청 (Q1·Q2)」

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-09-30 승인)
- [x] Build Spec §4 구현 체크리스트 전 항목 완료
- [x] Build Spec §5 검증 통과 → IMPLEMENTED (2026-09-30)

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(comprehensive, 4 아티팩트): [`swap-requests/build-spec-index.md`](swap-requests/build-spec-index.md)

요지:
- **요청(3a):** 「근무 조정」 → 사람 체크(나 자동 포함) → 날짜 클릭 → 재배정 팝업에서 칩 두 개를 눌러 맞바꾸기 → 즉시 규칙 검사 → 코멘트 → 요청 보내기. 협의 기간·확정된 달만.
- **응답:** 받은 요청 수락·거절, 보낸 요청 철회. 전원 수락 = 재검사 뒤 즉시 반영(Q1), 누구든 거절 = 종료, 협의 기간 끝 = 만료.
- **동시성:** 겹치는 요청은 경고, 먼저 반영된 쪽만 적용. 관리자 편집·휴가 승인으로 칸이 바뀌면 걸린 요청은 무효.
- **알림:** 근무 조정 메뉴·패널 배지, 근무표 띠 "받은 교환 요청 N건", 반영되면 "바뀐 근무" 안내.

### 구현 결과 (2026-09-30)

- 메인 저장소 `packages/domain/src/swap.ts`, `apps/web/src/server/swaps/`, `components/adjust/NurseAdjust.tsx`, 마이그레이션 `0004_swap_requests`,
  2-7 관리자 저장·휴가 승인/취소에 무효 처리 연결. 편차 4건은 Build Spec §7(주요: 관리자 현황 패널 생략, 31일 달 열 22px).
- 검증: 단위 361 · pytest 12 · 통합 136 · E2E 34 · 빌드.
- 확인: 협의 기간에 간호사로 로그인 → 근무 조정 → 「근무 조정」 → 사람 체크 → 날짜 → 칩 두 개 맞바꾸기 → 요청 보내기 → 상대가 수락.

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 요청·응답·무효 규칙이 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-8을 `HUMAN_APPROVED`로 업데이트 → `09-integration-e2e.md`로 이동

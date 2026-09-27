---
phase: 02-construction
stage: 06-solver-generation
status: AI_PROPOSED
updated: 2026-09-28
---

# [Stage 2-6] 솔버·듀티 생성 (S8)

## 목적

신청 마감이 지난 달에 대해 관리자가 CP-SAT 솔버로 근무표 안을 만들고(리롤 = 다른 시드), TS 검사기로 재검사한 결과·배정 요약·격자를 확인한 뒤
한 안을 확정해 근무표(S3)에 공개한다. 해가 없으면 원인을 보여 준다.

## 입력 (Inputs)

- [`../inputs/design-handoff_v4/README.md`](../inputs/design-handoff_v4/README.md) S8 / 프로토타입 `id="1i"`
- [`../01-inception/03-architecture-decision.md`](../01-inception/03-architecture-decision.md) §1·§3·§7
- [`../01-inception/02-domain-model.md`](../01-inception/02-domain-model.md) §3·§4·§5
- 2-2 검사기·정산, 2-3 이월, 2-4 규칙, 2-5 신청·휴가
- [`../DECISIONS.md`](../DECISIONS.md) 2026-09-28 「2-6 솔버·듀티 생성 (Q1~Q4)」·「2-6 솔버 모델」

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-09-28, 승인 대기)
- [ ] Build Spec §4 구현 체크리스트 전 항목 완료
- [ ] Build Spec §5 검증 통과 → IMPLEMENTED

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(comprehensive, 4 아티팩트): [`solver-generation/build-spec-index.md`](solver-generation/build-spec-index.md)

요지:
- **솔버:** `services/solver`(Python 3.12·OR-Tools CP-SAT·FastAPI, DB 없음). 하드 제약은 2-2 검사기 하드 규칙과 1:1, 소프트는 가중 합
  (공정성 min-max가 1순위). 해가 없으면 원인 그룹(날짜·듀티·사람)을 돌려준다. 결과는 저장 전에 TS 검사기로 재검사한다.
- **생성·리롤·확정(Q1·Q3·Q4):** 마감 뒤에만 생성, 리롤마다 n번째 안으로 보관, 우선 반영 체크박스는 그 안에만 적용. 신청·휴가가 바뀌면 옛 안은 확정할 수 없다.
- **화면(Q2):** 1i 그대로 + 결과 아래 생성안 격자와 ‹ › 안 이동.
- **교차 검증:** 11월·신규 3인 기간·연휴·인원 부족·종이 10월 시나리오에서 하드 위반 0을 CI가 확인한다.

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 목적 우선순위·생성 시점·확정 조건이 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-6을 `HUMAN_APPROVED`로 업데이트 → `07-adjust-close.md`로 이동

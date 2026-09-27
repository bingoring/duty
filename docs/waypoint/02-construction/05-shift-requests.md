---
phase: 02-construction
stage: 05-shift-requests
status: AI_PROPOSED
updated: 2026-09-27
---

# [Stage 2-5] 근무 신청·휴가 (S4 + S5 팝오버)

## 목적

다음 달 근무표 격자 위에서 근무 신청(OFF·D·E·N 복수 선택·교육)과 휴가 신청을 임시 저장 → 제출하고, 관리자가 같은 화면에서 신청을 편집하며 휴가를
승인·반려하게 한다. 제출된 신청과 승인된 휴가는 2-6 근무 생성의 입력이 된다.

## 입력 (Inputs)

- [`../inputs/design-handoff_v3/README.md`](../inputs/design-handoff_v3/README.md) S4·S5 / 프로토타입 2a·3b
- [`../01-inception/02-domain-model.md`](../01-inception/02-domain-model.md) §2·§3·§6·§8
- 2-2 도메인(신청 스키마·경조 일수·계획 전이), 2-3 이월·잔여 계산, 2-4 규칙·교육 한도
- [`../DECISIONS.md`](../DECISIONS.md) 2026-09-27 「2-5 근무 신청·휴가 (Q1~Q4)」

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-09-27, 구현 착수 승인 대기)
- [ ] Build Spec §4 구현 체크리스트 전 항목 완료
- [ ] Build Spec §5 검증 통과 → IMPLEMENTED

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(standard, 4 아티팩트): [`shift-requests/build-spec-index.md`](shift-requests/build-spec-index.md)

요지:
- **신청 흐름(Q2):** 팝오버 저장은 임시(본인만), "신청 제출"로 공개. 제출 뒤 고치면 다시 임시. 마감까지 제출하지 않은 신청은 생성에 쓰지 않는다.
- **휴가(3b):** 연차·경조사(사유별 일수로 종료일 자동)·병가·공가(사유)·특별휴가·검진(0.5). 겹침·예정 잔여 초과는 저장 차단. 대기 휴가는 점선 '휴'(Q4).
- **관리자(Q1):** 같은 화면에서 모든 줄 편집, "휴가 승인 대기" 패널로 승인·반려. 확정된 달의 휴가는 2-7.
- **OFF 목표(Q3):** 기준 OFF − 누적 OFF + 슬리핑오프. 넘으면 경고.
- **달 계획:** 신청 기간(전월 1일 ~ 마감일)에 화면을 열면 자동 생성, 마감이 지나면 마감 상태로.
- **스키마:** `shift_requests.submitted_at`, `leave_requests.comment`, 휴가 종류에 연차·상태에 임시 추가.

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 신청·제출·휴가·승인 규칙이 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-5를 `HUMAN_APPROVED`로 업데이트 → `06-solver-generation.md`로 이동

---
phase: 02-construction
stage: 05-shift-requests
status: HUMAN_APPROVED
updated: 2026-09-28
---

# [Stage 2-5] 근무 신청·휴가 (S4 + S5 팝오버)

## 목적

다음 달 근무표 격자 위에서 근무 신청(OFF·D·E·N 복수 선택·교육)과 휴가 신청을 임시 저장 → 제출하고, 관리자가 같은 화면에서 신청을 편집하며 휴가를
승인·반려하게 한다. 제출된 신청과 승인된 휴가는 2-6 근무 생성의 입력이 된다.

## 입력 (Inputs)

- [`../inputs/design-handoff_v4/README.md`](../inputs/design-handoff_v4/README.md) S4·S5·S4-A / 프로토타입 2a·3b·4a
- [`../01-inception/02-domain-model.md`](../01-inception/02-domain-model.md) §2·§3·§6·§8
- 2-2 도메인(신청 스키마·경조 일수·계획 전이), 2-3 이월·잔여 계산, 2-4 규칙·교육 한도
- [`../DECISIONS.md`](../DECISIONS.md) 2026-09-27 「2-5 근무 신청·휴가 (Q1~Q4)」

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-09-27 승인)
- [x] Build Spec §4 구현 체크리스트 전 항목 완료
- [x] Build Spec §5 검증 통과 → IMPLEMENTED (2026-09-27)

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(standard, 4 아티팩트): [`shift-requests/build-spec-index.md`](shift-requests/build-spec-index.md)

요지:
- **신청 흐름(Q2):** 팝오버 저장은 임시(본인만), "신청 제출"로 공개. 제출 뒤 고치면 다시 임시. 마감까지 제출하지 않은 신청은 생성에 쓰지 않는다.
- **휴가(3b):** 연차·경조사(사유별 일수로 종료일 자동)·병가·공가(사유)·특별휴가·검진(0.5). 겹침·예정 잔여 초과는 저장 차단. 대기 휴가는 점선 '휴'(Q4).
- **관리자(Q1, v4 4a):** 같은 화면에서 모든 줄 편집, 우측 「휴가 승인」 패널(접기·펼치기, 월 배지, 인원 영향, 처리 이력)로 승인·반려.
- **확정된 달 휴가(Q5):** 간호사는 확정된 달을 열어 휴가만 신청, 승인하면 칸을 바로 휴가로 바꾼다(인원 영향 경고는 보여 주되 승인 가능). 대체 지정은 2-7.
- **OFF 목표(Q3):** 기준 OFF − 누적 OFF + 슬리핑오프. 넘으면 경고.
- **달 계획:** 신청 기간(전월 1일 ~ 마감일)에 화면을 열면 자동 생성, 마감이 지나면 마감 상태로.
- **스키마:** `shift_requests.submitted_at`, `leave_requests.comment`, 휴가 종류에 연차·상태에 임시 추가.

### 구현 결과 (2026-09-27)

- 메인 저장소 `packages/domain/src/requests.ts`, `apps/web/src/server/requests/`(plan·service·balance·load·dto·actions), `server/schedule/input.ts`,
  `components/requests/`, `app/(app)/requests/page.tsx`, 마이그레이션 `0002`. 편차 5건은 Build Spec §7.
- 검증: 단위 331 · 통합 104 · E2E 28 · 빌드.
- 확인: `pnpm dev` → 사번 `00103`(간호사) → 근무 신청 / 사번 `00101`(관리자) → 근무 신청(우측 휴가 승인). 실제 날짜가 9월이면 대상은 10월이다(확정된 달이라 휴가만 신청).
  11월 신청을 보려면 `DUTY_FAKE_TODAY=2026-10-13 pnpm dev`.

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 신청·제출·휴가·승인 규칙이 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-5를 `HUMAN_APPROVED`로 업데이트 → `06-solver-generation.md`로 이동

---
phase: 02-construction
stage: 03-schedule-view
status: AI_PROPOSED
updated: 2026-09-27
---

# [Stage 2-3] 근무표 조회 (S3)

## 목적

로그인 첫 화면 S3를 만든다: 병동 한 달 근무표 격자(1c 내 줄 강조형), 요약 카드 5개, 월 이동, 인쇄. 이월 off·누적 off·ⓝN·특휴/개원·검진·보는
원장과 `@duty/domain` 정산으로 계산한다.

## 입력 (Inputs)

- [`../inputs/design-handoff_v2/README.md`](../inputs/design-handoff_v2/README.md) 확정 사항 2~5·12~14, S3, 공통 셸 / 프로토타입 `id="1c"`·3b 사이드바
- [`../01-inception/02-domain-model.md`](../01-inception/02-domain-model.md) §2, §4 종이 우측 컬럼, §8 권한
- [`../01-inception/03-architecture-decision.md`](../01-inception/03-architecture-decision.md) §5 권한 계층, §7 NFR
- 2-2 `@duty/domain` (정산·빨간 날·개원오프·근무 시각)
- [`../DECISIONS.md`](../DECISIONS.md) 2026-09-27 「2-3 근무표 조회 (Q1~Q4)」

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-09-27, 구현 착수 승인 대기)
- [ ] Build Spec §4 구현 체크리스트 전 항목 완료
- [ ] Build Spec §5 검증 통과 → IMPLEMENTED

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(standard, 4 아티팩트): [`schedule-view/build-spec-index.md`](schedule-view/build-spec-index.md)

요지:
- **화면:** 1c를 서버 컴포넌트로 재현한다(헤더 ‹ › · 배지 · 범례 · 인쇄 / 카드 5개 / 격자 / 하단 안내). 클라이언트 JS는 인쇄 버튼뿐이다.
- **이월 값:** 마감된 달은 정산 스냅샷, 확정·미마감 달은 원장 현재 합계에 앞선 확정·미마감 달을 차례로 `settleMonth`한 값에서 출발한다
  (여러 달이 마감 전이어도 이월이 이어진다).
- **공개 범위(Q2):** 동료의 휴가 종류·검진 반차·잔여 컬럼까지 모두 공개. 코멘트·휴가 사유는 S3에 없다.
- **표시(Q1·Q3):** 누적 OFF는 색 없이 부호 + "다음 달 반납 n / n일 더 받음". "이번달 OFF"는 정산 기준 OFF.
- **기본 달(Q4):** 이번 달. 다음 달이 확정되면 헤더 링크.
- **핸드오프 v2:** 메뉴 재구성(근무 조정을 일반 메뉴로, 휴가 신청 제거, 관리자 3개), 사이드바「내 휴가 잔여」(모든 화면), 휴가 칩 `휴`(#D8E6C3).
- **개발 데이터:** 종이 2026-10(가명)을 확정 근무표·초기 원장으로 시드해 화면·E2E에서 쓴다.

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 화면·이월 계산 규칙이 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-3을 `HUMAN_APPROVED`로 업데이트 → `04-admin-settings.md`로 이동

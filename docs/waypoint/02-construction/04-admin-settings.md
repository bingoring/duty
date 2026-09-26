---
phase: 02-construction
stage: 04-admin-settings
status: AI_PROPOSED
updated: 2026-09-27
---

# [Stage 2-4] 관리자 설정 (S10·S11)

## 목적

관리자가 간호사(추가·수정·제거·임시 비밀번호·트레이닝·잔여치)와 규칙(수치·토글·금지 패턴·버전 이력), 공휴일·병원 지정일·개원기념일을
관리하게 하고, 연초 잔여치 처리를 자동화한다.

## 입력 (Inputs)

- [`../inputs/design-handoff_v3/README.md`](../inputs/design-handoff_v3/README.md) S10·S11 / 프로토타입 `id="1k"`·`id="2b"`
- [`../01-inception/02-domain-model.md`](../01-inception/02-domain-model.md) §2·§4·§6
- 2-1 인증(임시 비밀번호·세션), 2-2 `@duty/domain`(규칙 스키마·특휴·트레이닝 기본값), 2-3 원장 합계
- [`../DECISIONS.md`](../DECISIONS.md) 2026-09-27 「2-4 관리자 설정 (Q1~Q4)」

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-09-27 승인)
- [x] Build Spec §4 구현 체크리스트 전 항목 완료
- [x] Build Spec §5 검증 통과 → IMPLEMENTED (2026-09-27)

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(standard, 4 아티팩트): [`admin-settings/build-spec-index.md`](admin-settings/build-spec-index.md)

요지:
- **S10 간호사 관리:** 1k 표·검색·추가 패널에 연차 구분·노조·근무 방식·권한과 초기 잔여치(연차·잔여 N·이월 오프)를 더한다(Q1·Q2).
  추가하면 임시 비밀번호를 한 번만 보여 주고, 특휴(산식)·검진·병가·개원오프를 자동 부여한다. 수정 창에서 트레이닝·표 순서·잔여치 조정(원장 기록),
  ··· 메뉴에서 비밀번호 재발급·제거(소프트 삭제, 세션 삭제).
- **S11 규칙 설정:** 2b를 따르되 2-2에서 늘어난 수치까지 그룹별로 보여 준다(22개 + 토글 5). 저장 = 새 버전 + 변경 이력, 동시 저장 충돌 방지.
- **공휴일(Q3):** 공공데이터 특일 정보 API로 가져오기(인증키는 사용자가 발급해 `.env`에). 병원 지정일·노사 협의일·개원기념일은 S11 아래 섹션에서 입력.
- **연초 처리(Q4):** 새해 첫 요청에서 자동. 전년 12월이 확정·미마감이면 마감 뒤로 미룬다(12월 사용분 이중 차감 방지).

### 구현 결과 (2026-09-27)

- 메인 저장소 `apps/web/src/server/{staff,rules,holidays,balances,admin}/`, `components/admin/`, `app/(app)/admin/{staff,rules}/page.tsx`,
  `packages/domain/src/rule-editing.ts`. 편차 4건은 Build Spec §7(주요: 시스템 첫해에는 연초 처리를 하지 않는 R-YEAR-7 추가).
- 검증: 단위 298 · 통합 77 · E2E 22 · 빌드. 공휴일 API는 가짜 응답으로 테스트했다(실제 호출은 인증키 필요).
- 확인: `pnpm dev` → 사번 `00101` → 간호사 관리 / 규칙 설정.

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 화면·원장 기록·연초 처리 규칙이 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-4를 `HUMAN_APPROVED`로 업데이트 → `05-shift-requests.md`로 이동

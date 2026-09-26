---
phase: 02-construction
stage: 02-domain-core
status: AI_PROPOSED
updated: 2026-09-27
---

# [Stage 2-2] Domain Core

## 목적

`@duty/domain`에 규칙 검사기·인원 집계·월 정산·특휴 산식·셀 출처·근무표 상태 전이를 순수 TS로 만들고, 종이 근무표 2026-10(가명)
fixture로 검증해 이후 모든 화면(2-3~2-7)과 솔버 교차 검증(2-6)의 기반을 만든다.

## 입력 (Inputs)

- [`../01-inception/02-domain-model.md`](../01-inception/02-domain-model.md) §0 정산 부호, §3 상태 전이, §4 정산, §5 셀 출처, §7 인원, §9 검사기 계약
- [`../01-inception/03-architecture-decision.md`](../01-inception/03-architecture-decision.md) §1 모노레포, §3 TS 검사기 = 규칙 SoT, §4, §7 NFR
- [`../inputs/requirements_v3.md`](../inputs/requirements_v3.md) 간호부·야간·응급실 지침
- [`../inputs/design-handoff_v1/README.md`](../inputs/design-handoff_v1/README.md) S7·S8·S9·S11
- [`../01-inception/evidence/paper-2026-10-settlement-check.py`](../01-inception/evidence/paper-2026-10-settlement-check.py) 종이 10월(가명)
- 2-1 코드: `packages/domain`(allowed-set·`RuleSet`·`CellSchema`·`SHIFT_TIMES`)

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-09-27 승인)
- [x] Build Spec §4 구현 체크리스트 전 항목 완료
- [x] Build Spec §5 검증 통과 → IMPLEMENTED (2026-09-27)

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(comprehensive, frontend-components N/A): [`domain-core/build-spec-index.md`](domain-core/build-spec-index.md)

요지:
- **검사기:** `checkSchedule(ScheduleInput) → { hardViolations, softWarnings }` 순수·결정적 함수. 하드 12종(금지 패턴·휴식·
  나이트 상한·연속 N·연속 오프·인원·K-tass·트레이닝·연차/교육 신청·슬리핑오프 한도·노조교육·칸 누락), 소프트 7종(나이트 목표·
  N 후 OFF 2개·주말 통 OFF·수간호사 보충·저연차만·반복 겹침·신청 불충족). 전월 꼬리 칸을 받아 월 경계 위반을 잡는다.
  문구는 `formatViolation`이 핸드오프 S8·S9 예시 형식으로 만든다.
- **정산:** `settleMonth` = 1-2 §4 공식(종이 10명 전원 일치) + 원장 증감 목록, 마감 취소용 `reverseEntries`.
- **기타:** 특휴 산식(정수 연산, 구간 경계값 고정), 개원오프 대상, 셀 출처(admin > requested > auto), MonthPlan 전이, 신청 마감 기본 날짜.
- **fixture:** 저장소 루트 `fixtures/paper-2026-10.json`(가명) — 2-6 솔버 테스트도 같은 파일을 쓴다.
- **종이로 확인한 해석:** 16시간 휴식은 서로 다른 근무 코드 사이에만 적용한다(종이의 D-D·N-N). 10/2 D는 수간호사 보충(최후의 수단)이다.
- **규칙 기본값 변경:** 최대 연속 오프 10 → 15(사용자 답변, 편차 기록).
- **신규 3인 근무:** 3인 배정 기간은 완전 신규 3주·경력자 2주, 기간 뒤 신규의 첫 N 3개도 3인(신규 + 프리셉터 + 1명). `trainings.kind` 컬럼과 규칙 수치 2개를 추가한다.

### 구현 결과 (2026-09-27)

- 메인 저장소 `packages/domain/src/`(dates·types·grid·staffing·cell-source·checker/·settlement·leave·month-plan), `fixtures/paper-2026-10.json`,
  web `rules.ts`(예전 규칙 버전 파싱)·마이그레이션 `0001_training_kind`. 편차 4건은 Build Spec §7에 기록했다.
- 검증: 단위 204(domain 166 + web 38) · 통합 35 · E2E 9 · 빌드. 종이 10월 누적 OFF 10명 일치, 하드 위반 0.
- 구현 중 추가 설명 반영: 다음 달 검사에서도 전월 말을 이어서 본다(10/31 N이면 11월 초 N은 2개까지, N 후 OFF도 월을 넘어 판단).
- 개발 DB는 규칙 v1(최대 연속 오프 10)이 남아 있으므로 README 안내대로 다시 시드해야 한다.

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 규칙 해석(business-rules)이 병동 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-2를 `HUMAN_APPROVED`로 업데이트 → `03-schedule-view.md`로 이동

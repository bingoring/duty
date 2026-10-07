---
phase: 02-construction
stage: 09-integration-e2e
status: AI_PROPOSED
updated: 2026-10-07
---

# [Stage 2-9] 통합·E2E

## 목적

화면별 E2E가 따로 확인한 기능들이 한 달 운영 흐름으로 이어졌을 때도 맞게 동작하는지 하나의 연속 시나리오로 확인한다.
11월을 대상으로 신청(휴가 포함) → 마감 → 생성·확정 → 협의 기간 교환·관리자 조정 → 월 마감 → 12월 이월까지 "오늘"을 옮겨 가며 따라간다.
함께 화면 × 역할별 E2E 커버리지를 점검해 빠진 핵심 경로를 메운다.

## 입력 (Inputs)

- [`../01-inception/03-architecture-decision.md`](../01-inception/03-architecture-decision.md) §10 「통합·E2E」 행(minimal)
- 메인 저장소 `apps/web/e2e/*.spec.ts`(8개, 35 테스트) · `playwright.config.ts` · `e2e/global-setup.ts`
- `apps/web/src/server/schedule/month.ts` `appToday()`(DUTY_FAKE_TODAY)
- 2-5 휴가, 2-7 조정·마감, 2-8 교환 Build Spec
- [`../DECISIONS.md`](../DECISIONS.md) 2026-10-07 「2-9 통합·E2E (Q1~Q3)」

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-10-07)
- [x] Build Spec §4 구현 체크리스트 전 항목 완료
- [x] Build Spec §5 검증 통과 → IMPLEMENTED (2026-10-07)

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(minimal, 인덱스만): [`integration-e2e/build-spec-index.md`](integration-e2e/build-spec-index.md) (IMPLEMENTED)

요지:
- **시계(Q1):** 운영이 아닐 때만 쿠키 `duty_fake_today`가 env보다 앞선다. `appToday()`를 부르는 요청 경로 19곳을 `await requestToday()`로 바꾼다. 쿠키는 브라우저 컨텍스트마다 따로라 다른 스펙에 새지 않는다.
- **흐름(Q2):** 11월 한 달 — 10/13 신청·휴가 → 10/16 생성·확정 → 10/16~20 교환 요청 수락·관리자 편집 → 12/1 11월 마감 → 12월 근무표 이월 값 확인. 휴가·교환 포함.
- **격리:** 흐름 스펙은 별도 Playwright 프로젝트 `cycle`로 두고 기존 `chromium` 프로젝트 뒤에 돌린다(11월 상태를 바꾸므로).
- **커버리지(Q3):** 화면 × 역할 표를 만들고 빠진 핵심 경로(교환 거절·철회 등)를 메운다. 운영 빌드 스모크는 3-1로 미룬다.

### 구현 결과 (2026-10-07)

- 메인 저장소 `apps/web/src/server/clock.ts`(`requestToday`), `e2e/cycle/`(reset + 한 달 흐름), `e2e/search.ts`(규칙을 통과하는 교환·편집 찾기), 보강 E2E 3건.
- **발견·수정한 결함:** 다음 달이 이미 확정된 달을 생성하면 솔버가 다음 달 초 칸을 몰라 TS 재검사에서 늘 탈락("다른 시드로 다시 시도"가 끝나지 않음).
  솔버 계약에 선택 필드 `nextHead`를 더해 경계 규칙(금지 패턴·휴식·연속 N·연속 OFF)에 고정값으로 넣었다. 다음 달이 없으면 키를 빼 입력 해시는 그대로다.
- 검증: 단위 362 · pytest 14 · 통합 137 · E2E 38(연속 6회 그린) · 빌드. 편차 7건(§7), 커버리지 표(§7 아래).

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 흐름 단계·시계 방식이 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 커버리지 표·편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-9를 `HUMAN_APPROVED`로 업데이트 → R-1 독립 코드 리뷰

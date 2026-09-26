# duty (벌써 근무표짤 때가 됐어?) — Waypoint Status

**Framework:** [Waypoint](https://github.com/bingoring/waypoint)
**Requirements:** [inputs/requirements_v3.md](inputs/requirements_v3.md) (근무 지침 원문 + 근무자 명단)
**Design handoff:** [inputs/design-handoff_v1/](inputs/design-handoff_v1/README.md) (최신)
**Decisions (audit):** [DECISIONS.md](DECISIONS.md)
**Last updated:** 2026-09-27

> 🔒 **개인정보:** 공개 저장소다. 간호사 이름·사번은 모두 가명이며, 실명 자료는 커밋하지 않는다([DECISIONS](DECISIONS.md) 2026-09-26).

> 🏗️ **2-2 Domain Core 구현 완료 → 승인 대기 (2026-09-27).** `@duty/domain`에 규칙 검사기(하드 12·소프트 7)·인원 집계(신규 3인 근무·
> 수간호사 보충)·월 정산·특휴·셀 출처·근무표 상태 전이·위반 문구. 종이 10월: 누적 OFF 10명 일치, 하드 위반 0.
> 다음 달 검사도 전월 말 15일을 이어서 본다(10/31 N → 11월 초 N 최대 2개). 단위 204·통합 35·E2E 9 그린. 편차 4건(Build Spec §7).
>
> 📝 **2-2 Domain Core Build Spec READY (2026-09-27).** 규칙 검사기(하드 12·소프트 7)·월 정산·특휴·셀 출처·근무표 상태 전이를
> `@duty/domain` 순수 함수로 설계했다. 종이 10월에 규칙을 대 보니 16시간 휴식은 다른 코드 사이에만 적용되고, 10/2 D는 수간호사 보충이었다.
> 질문 Q1~Q5 해소 — 수간호사 D는 최후의 수단(소프트 경고), 최대 연속 오프 기본값 10 → 15, 신규 3인 기간 완전 신규 3주·경력자 2주 +
> 기간 뒤 첫 N 3개도 3인. 구현 착수 승인 대기.
>
> ✅ **2-1 Foundation 승인 (2026-09-27).** pnpm 모노레포(`apps/web` Next.js 16 + `packages/domain`),
> 16 테이블 스키마·마이그레이션, 가명 시드·부트스트랩·실명 CSV 가져오기, argon2id·DB 세션·잠금·첫 로그인 비밀번호 변경,
> S1 로그인·공통 셸(1d·1c 재현), Docker(운영 compose)·CI. 단위 60·통합 35·E2E 9 그린, 운영 빌드에서 로그인까지 확인.
> 편차 11건(Build Spec §7) — 주요: 세션 연장을 Route Handler로, 강제 변경의 임시 비밀번호 재사용 차단 추가.
>
> 📝 **2-1 Foundation Build Spec READY (2026-09-26).** Inception 1-1~1-3 승인. 공개 저장소에 실명 자료를 올린 사고를 정리했다
> (가명 치환 + 이 프로젝트 커밋을 1개로 다시 씀, 원본은 메인 저장소 `.local/`). 2-1 스펙: pnpm 모노레포 + 15 테이블 스키마 +
> 가명 시드·실명 로컬 CSV 가져오기 + argon2id·DB 세션·5회 잠금·첫 로그인 비밀번호 변경 + S1·공통 셸. 구현 착수 승인 대기.
>
> 📝 **1-3 Architecture Decision ⚠️ 제안 (2026-09-26).** 1-2 승인. 인원 여유를 계산해 보니 신규 1명이 3인 배정 기간이면
> 10월은 최소 인원만으로 6칸이 모자라고 나이트 여유는 1칸이다 → 하드 제약 보장 · 불가능 판정 · min-max 공정성이 필요해
> **OR-Tools CP-SAT(Python 무상태 서비스)** 를 권고했다. 규칙 SoT는 TS `@duty/domain` 검사기이고, 솔버 결과는 항상 재검사한다.
> 스택: Next.js 16 + Tailwind v4 + Postgres 16 + Drizzle, 자체 세션 인증, Docker Compose 한 벌. 질문 A1~A3 기본안으로 확정, 승인됨(CP-SAT · 클라우드 VPS · 인원 부족 달은 누적 OFF 음수 허용).
>
> 📝 **1-2 Domain Model 제안 (2026-09-26).** 1-1 승인(질문은 기본안대로 확정, Q5 답변 반영). 요구사항 원문을 입력으로
> 등록했다. **핸드오프 안에서 누적 OFF 부호가 충돌**해 종이 근무표 10월분 10명을 옮겨 계산했고,
> `누적 = 이월 + (실제 OFF − 슬리핑오프 − 기준 OFF)`, 기준 OFF 11(대체공휴일 포함)에서 10명 전원이 일치했다
> (양수 = 더 쉼 → 반납). 잔여치는 스냅샷이 아니라 append-only 원장으로 둔다. 질문 D1~D5 해소(특휴는 원문 §6-7
> 해당 연도 재직 일수 산식으로 정정) — 승인됨.
>
> 🚩 **프로젝트 착수 (2026-09-26).** 응급실 병동 간호사 3교대 근무표 웹. 핸드오프 v1(hi-fi HTML 프로토타입 +
> 종이 근무표 원본 사진)을 입력으로 등록하고 1-1 Context Synthesis를 제안했다. 코드베이스는 아직 없다.

---

## Phase 1 — Inception (What)

| 스테이지 | 문서 | 상태 |
|---------|------|------|
| 1-1 Context Synthesis | [01-context-synthesis.md](01-inception/01-context-synthesis.md) | HUMAN_APPROVED |
| 1-2 Domain Model | [02-domain-model.md](01-inception/02-domain-model.md) | HUMAN_APPROVED |
| 1-3 Architecture Decision ⚠️ | [03-architecture-decision.md](01-inception/03-architecture-decision.md) | HUMAN_APPROVED |

## Phase 2 — Construction (How)

> 1-3 §10의 분해(승인됨). MVP 범위 = 1-1 Q1. 2차 범위(S2·S5·S6·S7)는 MVP 리뷰 후 2-9 이후로 추가.

| 스테이지 | 문서 | 상태 |
|---------|------|------|
| 2-1 Foundation | [01-foundation.md](02-construction/01-foundation.md) · [Build Spec](02-construction/foundation/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-2 Domain Core | [02-domain-core.md](02-construction/02-domain-core.md) · [Build Spec](02-construction/domain-core/build-spec-index.md) (IMPLEMENTED) | AI_PROPOSED |
| 2-3 근무표 조회 (S3) | 02-construction/03-schedule-view.md | PENDING |
| 2-4 관리자 설정 (S10·S11) | 02-construction/04-admin-settings.md | PENDING |
| 2-5 근무 신청 (S4) | 02-construction/05-shift-requests.md | PENDING |
| 2-6 솔버·듀티 생성 (S8) | 02-construction/06-solver-generation.md | PENDING |
| 2-7 근무 조정·월 마감 (S9) | 02-construction/07-adjust-close.md | PENDING |
| 2-8 통합·E2E | 02-construction/08-integration-e2e.md | PENDING |

## Phase R — Independent Code Review 🔍 (Construction → Operations 게이트)

> 작성자와 **컨텍스트가 분리된** 독립·적대적 리뷰어가 코드를 검토한다. FRAMEWORK "리뷰 게이트" 참조.

| 스테이지 | 문서 | 상태 |
|---------|------|------|
| R-1 Independent Code Review | 0R-review/01-independent-review.md | PENDING |

## Phase 3 — Operations (Ship)

| 스테이지 | 문서 | 상태 |
|---------|------|------|
| 3-1 Deployment | 03-operations/01-deployment.md | PENDING |
| 3-2 Monitoring | 03-operations/02-monitoring.md | PENDING |

---

## AI 진입점

> AI는 위 테이블에서 `PENDING` 상태인 가장 앞 스테이지부터 작업을 시작하세요.
> 규칙: [`FRAMEWORK.md`](../../FRAMEWORK.md) 참조

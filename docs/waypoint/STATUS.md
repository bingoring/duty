# duty (벌써 근무표짤 때가 됐어?) — Waypoint Status

**Framework:** [Waypoint](https://github.com/bingoring/waypoint)
**Requirements:** [inputs/requirements_v3.md](inputs/requirements_v3.md) (근무 지침 원문 + 근무자 명단)
**Design handoff:** [inputs/design-handoff_v4/](inputs/design-handoff_v4/README.md) (최신, 2026-09-27) · [v3](inputs/design-handoff_v3/README.md) · [v2](inputs/design-handoff_v2/README.md) · [v1](inputs/design-handoff_v1/README.md)
**Decisions (audit):** [DECISIONS.md](DECISIONS.md)
**Last updated:** 2026-09-30

> 🔒 **개인정보:** 공개 저장소다. 간호사 이름·사번은 모두 가명이며, 실명 자료는 커밋하지 않는다([DECISIONS](DECISIONS.md) 2026-09-26).

> 🏗️ **2-7 근무 조정·월 마감 구현 완료 → 승인 대기 (2026-09-30).** S9 관리자(1j) 칸 편집(즉시 검사·예외 적용·맞바꾸기·대체 지정)·저장 재배포,
> 월 마감(종이 10월 마감 = 원장 누적 OFF 일치)·마감 취소, 확정된 달 휴가 대체 지정·승인 취소, 근무표 "바뀐 근무" 안내.
> 단위 353·pytest 12·통합 129·E2E 32 그린, 편차 7건.
>
> 📝 **2-7 근무 조정·월 마감 Build Spec READY (2026-09-30).** S9 관리자(1j): 칸 편집 팝오버·즉시 검사·맞바꾸기·대체 지정·저장·재배포,
> 월 마감(정산 원장)·마감 취소, 확정된 달 휴가 대체 지정·승인 취소, 근무표 상단 "바뀐 근무" 안내. Q1~Q4 해소(Q3 안내 위치는 검토 뒤 근무표로). 구현 착수 승인 대기.
>
> ✅ **2-6 솔버·듀티 생성 승인 (2026-09-29).**
>
> 🏗️ **2-6 솔버·듀티 생성 구현 완료 → 승인 대기 (2026-09-28).** CP-SAT 솔버 서비스(`services/solver`)·계약 패키지·S8(1i + 생성안 격자·안 이동).
> 생성 → TS 재검사 → n번째 안 보관 → 확정(입력이 바뀐 안은 차단) → 근무표 공개. 해가 없으면 원인 최대 5개. 교차 검증 5 시나리오 하드 위반 0.
> 단위 343·pytest 12·통합 117·E2E 30 그린, 편차 8건. `pnpm dev`가 솔버도 함께 띄운다.
>
> 📝 **2-6 솔버·듀티 생성 Build Spec READY (2026-09-28).** CP-SAT 솔버 서비스(`services/solver`, Python) + 계약 패키지 + S8(1i + 생성안 격자).
> 질문 Q1~Q4 해소 — 마감 뒤에만 생성, 결과 아래 격자·안 이동, 신청 충돌은 한 사람에게 몰리지 않게, 우선 반영은 생성마다. 공정성(목표 OFF 부족 최댓값)이 1순위.
> 구현 착수 승인 대기.
>
> ✅ **2-5 근무 신청·휴가 승인 (2026-09-28).** 4a 패널을 핸드오프 치수로 다시 맞추고 확정된 달 대체 후보를 표시했다.
>
> 🏗️ **2-5 근무 신청·휴가 구현 완료 → 승인 대기 (2026-09-27).** 다음 달 격자 위 근무 신청(복수 옵션·교육, 임시 → 제출)·휴가 팝오버(경조사 종료일 자동,
> 잔여 초과 차단)·관리자 휴가 승인 패널(4a: 접기, 월 배지, 인원 영향, 처리 이력, 코멘트 호버). 확정된 달 휴가는 신청·승인 즉시 칸 대체.
> 단위 331·통합 104·E2E 28 그린, 편차 5건. 대체 지정·확정된 달 승인 취소는 2-7.
>
> 🎨 **핸드오프 v4 반영 (2026-09-27).** 4a 휴가 승인 패널(근무 신청 화면의 관리자 시점, 접기·펼치기, 확정된 달 인원 영향)과 S9 패널 접기(2-8).
> 2-5 범위 조정(Q5): 확정된 달의 휴가도 신청·승인(칸 대체)까지 2-5, 대체 지정만 2-7. 입력의 실명 16건 가명 치환·사진 제외.
>
> 📝 **2-5 근무 신청·휴가 Build Spec READY (2026-09-27).** 다음 달 격자 위 근무 신청(복수 옵션·교육)·휴가 신청(3b 팝오버) — 임시 저장 후 제출(Q2),
> 관리자는 같은 화면에서 편집·휴가 승인(Q1), OFF 목표 = 기준 − 누적 + 슬리핑오프(Q3), 대기 휴가 점선 '휴'(Q4). 확정된 달의 휴가는 2-7. 구현 착수 승인 대기.
> 2-4 후속 수정: 금지 패턴 입력 검사(D·E·N·S·OFF 외 문자·한글·중복 차단).
>
> ✅ **2-4 관리자 설정 승인 (2026-09-27).** S10 간호사 관리(추가·임시 비밀번호·트레이닝·잔여치 조정·재발급·제거)·
> S11 규칙 설정(수치 22 + 토글 5, 버전 이력, 동시 저장 차단)·공휴일(공공데이터 가져오기 + 병원 지정일·개원기념일, 개원오프 재계산)·
> 연초 자동 처리(12월 마감 뒤, 시스템 첫해 제외). 단위 298·통합 77·E2E 22 그린, 편차 4건. 공휴일 API는 `HOLIDAY_API_KEY` 필요.
>
> 📝 **2-4 관리자 설정 Build Spec READY (2026-09-27).** S10 간호사 관리(연차 구분·노조·근무 방식·권한·초기 잔여치 포함, 임시 비밀번호 1회 표시,
> 자동 부여, 잔여치 조정 원장 기록)·S11 규칙 설정(수치 22개 + 토글 5, 버전 이력)·공휴일(공공데이터 API 가져오기 + 병원 지정일·개원기념일)·
> 연초 자동 처리(전년 12월 마감 뒤). 구현 착수 승인 대기.
>
> 🎨 **핸드오프 v3 반영 (2026-09-27).** 변경 1건: S3 격자의 오늘 열 강조(헤더 청록·흰 글자, 열 전체 연청록 세로 띠, 이번 달만).
> 2-3에 구현했고 E2E는 `DUTY_FAKE_TODAY=2026-10-13`으로 날짜를 고정했다(운영에서는 무시). 입력의 실명 16건 가명 치환·사진 제외.
>
> ✅ **2-3 근무표 조회 승인 (2026-09-27).** S3 격자(1c)·요약 카드 5개·월 이동·인쇄(A4 가로 1장) + 공통 셸 v2(메뉴 재구성,
> 「내 휴가 잔여」). 이월 값은 마감 달 스냅샷 / 미마감 달 원장 + 앞선 확정 달 투영. 개발 시드에 종이 10월(가명) 확정본.
> 단위 276·통합 47·E2E 15 그린, 편차 4건(Build Spec §7). 확인: `pnpm db:seed` → `/?ym=2026-10`.
>
> 🎨 **핸드오프 v2 반영 (2026-09-27).** 근무 조정을 모든 간호사에게 열고 간호사 간 교환 요청(3a) 추가, 휴가 신청을 근무 신청 팝오버에 통합(3b, 증빙 없음),
> 메뉴 재구성(근무 조정이 일반 메뉴로), 사이드바 「내 휴가 잔여」, 휴가 칩 `휴`(#D8E6C3). 입력의 실명 16건은 가명 치환, 종이 사진은 제외했다.
> 단계 조정: 2-5에 휴가 포함, 2-8 교환 요청 신설, 통합은 2-9. 2-3 Build Spec에 메뉴·잔여 카드·휴가 칩 반영.
>
> 📝 **2-3 근무표 조회 Build Spec READY (2026-09-27).** 1c 격자·요약 카드 5개·월 이동·인쇄를 서버 컴포넌트로 만든다. 이월 값은 마감된 달은
> 정산 스냅샷, 미마감 달은 원장 + 앞선 확정 달 투영. 질문 Q1~Q4 해소 — 누적 OFF 색 없이 부호+설명, 동료 정보 모두 공개,
> 이번달 OFF = 정산 기준, 기본 달 = 이번 달. 구현 착수 승인 대기.
>
> ✅ **2-2 Domain Core 승인 (2026-09-27).** `@duty/domain`에 규칙 검사기(하드 12·소프트 7)·인원 집계(신규 3인 근무·
> 수간호사 보충)·월 정산·특휴·셀 출처·근무표 상태 전이·위반 문구. 종이 10월: 누적 OFF 10명 일치, 하드 위반 0.
> 다음 달 검사도 전월 말 15일을 이어서 본다(10/31 N → 11월 초 N 최대 2개). 달을 걸친 주말은 토요일이 속한 달로 세고,
> 한 사람의 D·E·N 차이가 2를 넘으면 경고한다. 이월 확장: 다음 달이 있을 때 앞 달 수정의 경계 검사, 주말 미배정 연속 개월 수,
> D·E·N 3개월 누적, 교육 연간 횟수, 잔여 초과. 요구사항 원문 절별 추적표(Build Spec §5). 단위 255·통합 35·E2E 9 그린. 편차 7건(Build Spec §7).
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

> 1-3 §10의 분해(승인됨)를 핸드오프 v2에 맞춰 조정(2026-09-27): 휴가 신청은 S4 팝오버로 들어와 2-5에 포함, 간호사 교환 요청은 2-8로 분리.
> 2차 범위(S2·S6·S7)는 MVP 리뷰 후 2-10 이후로 추가.

| 스테이지 | 문서 | 상태 |
|---------|------|------|
| 2-1 Foundation | [01-foundation.md](02-construction/01-foundation.md) · [Build Spec](02-construction/foundation/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-2 Domain Core | [02-domain-core.md](02-construction/02-domain-core.md) · [Build Spec](02-construction/domain-core/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-3 근무표 조회 (S3) | [03-schedule-view.md](02-construction/03-schedule-view.md) · [Build Spec](02-construction/schedule-view/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-4 관리자 설정 (S10·S11) | [04-admin-settings.md](02-construction/04-admin-settings.md) · [Build Spec](02-construction/admin-settings/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-5 근무 신청·휴가 (S4 + S5 팝오버 통합) | [05-shift-requests.md](02-construction/05-shift-requests.md) · [Build Spec](02-construction/shift-requests/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-6 솔버·듀티 생성 (S8) | [06-solver-generation.md](02-construction/06-solver-generation.md) · [Build Spec](02-construction/solver-generation/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-7 근무 조정·월 마감 (S9 관리자) | [07-adjust-close.md](02-construction/07-adjust-close.md) · [Build Spec](02-construction/adjust-close/build-spec-index.md) (IMPLEMENTED) | AI_PROPOSED |
| 2-8 근무 교환 요청 (S9 간호사, 3a) | 02-construction/08-swap-requests.md | PENDING |
| 2-9 통합·E2E | 02-construction/09-integration-e2e.md | PENDING |

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

---
build-spec: solver-generation
stage: 02-construction/06-solver-generation
status: READY
depth: comprehensive
updated: 2026-09-28
---

# Build Spec — 2-6 솔버·듀티 생성 (S8)

## §0. 개요 & 범위

- **목표(한 줄):** 신청 마감이 지난 달에 대해 관리자가 CP-SAT 솔버로 근무표 안을 만들고(리롤 = 다른 시드), TS 검사기로 재검사한 결과·배정 요약·격자를 보고
  한 안을 확정해 근무표(S3)에 공개한다. 해가 없으면 원인을 보여 준다.
- **SoT:**
  - 화면: 핸드오프 **v4** README「S8 관리자 · 듀티 생성·리롤 (1i)」, 프로토타입 `id="1i"`. 격자 미리보기는 1c 격자 스타일(Q2).
  - 아키텍처: [`03-architecture-decision.md`](../../01-inception/03-architecture-decision.md) §1 구조(solver 무상태 서비스), §3 CP-SAT 모델 개요·재검사·교차 검증, §7 NFR(생성 < 30초)
  - 도메인: [`02-domain-model.md`](../../01-inception/02-domain-model.md) §3 MonthPlan 전이(REQUEST_CLOSED → DRAFTING → CONFIRMED), §4 정산, §5 셀 출처
  - 규칙: 2-2 `@duty/domain` 검사기(하드 14·소프트 9, `checker/rules.ts`), `settleMonth`, `offTarget`, `createStaffing`(3인 근무·수간호사 보충)
  - 요구사항 원문: 기타 §12(생성·리롤), §14·§15(누적 OFF·슬리핑오프, "공평하게 돌아가는 것이 1순위"), 응급실 지침 §1~§14
  - 결정: [DECISIONS](../../DECISIONS.md) 2026-09-26 A1~A3(CP-SAT, 누적 OFF 음수 허용), 2026-09-28 「2-6 솔버·듀티 생성 (Q1~Q4)」
- **범위 밖:** 확정 뒤 셀 편집·재배포·월 마감(S9 관리자) → 2-7. 간호사 교환 요청 → 2-8. 나이트 전담 기간 지정 화면(토글·수치만 있음) → 2차.
  확정된 달을 다시 생성하는 기능(확정 = 되돌리지 않음, 수정은 2-7 조정).
- **규모/제약:** 교대 근무자 10명 + 수간호사 1명 × 28~31일 × 코드 5개. 솔버 시간 제한 기본 20초, 생성 1회 < 30초(1-3 §7).
  솔버는 DB에 접근하지 않고, 결과는 저장 전에 반드시 TS 검사기로 재검사한다(1-3 §3).
- **깊이 티어:** `comprehensive` — 새 런타임(Python 서비스)·계약 패키지·최적화 모델·불가능 진단·화면이 한 단계에 들어간다.

## §1. 분해

| 단위 | 파일 | 책임 |
|---|---|---|
| 계약 | `packages/contract/src/solver.ts` → `solver.schema.json` | 솔버 입출력 zod 스키마(SoT), JSON Schema 생성 |
| 솔버 서비스 | `services/solver/`(Python 3.12 · uv · FastAPI · OR-Tools) | `POST /solve` · `GET /health`, CP-SAT 모델, 불가능 진단, pytest |
| 입력 조립 | `apps/web/src/server/generate/input.ts` | DB → `ScheduleInput`(월초 잔여 채움) → `SolverRequest`(고정 칸·목표 OFF·가중치·우선 반영) + 입력 해시 |
| 솔버 클라이언트 | `server/generate/solver-client.ts` | HTTP 호출·시간 제한·오류 분류 |
| 생성 서비스 | `server/generate/service.ts` | 생성·리롤(후보 저장, 재검사), 확정(해시 비교 → schedule_cells 복사, CONFIRMED) |
| 조회·DTO | `server/generate/load.ts`, `dto.ts` | S8 화면 원자료: 필수 조건, 우선 반영 기본값, 후보 목록, 검사 결과 문구, 배정 요약, 격자 |
| 액션 | `server/generate/actions.ts` | `generateAction`·`confirmCandidateAction`(adminOnly) |
| 화면 | `app/(app)/admin/generate/page.tsx`, `components/generate/*` | 1i 좌측(필수 조건·우선 반영·리롤/확정) · 우측(결과·배지·검사 리스트·요약 표·격자 미리보기) |
| 도메인 보강 | `packages/domain/src/generation.ts` | 수간호사 고정 칸, 고정 칸 판정(휴가·특수 신청), 목표 OFF·슬리핑 한도, 검사 결과 → 통과/미충족 항목 |
| 인프라 | 루트 `package.json`·`pnpm-workspace.yaml`·`compose.prod.yaml`·CI | `pnpm dev`가 web + solver를 함께 띄움, 운영 compose에 solver, CI에 Python 잡·교차 검증 |

## §2. 아티팩트 인덱스

| 아티팩트 | 상태 | 링크 |
|---|---|---|
| domain-entities | ✅ | [`domain-entities.md`](domain-entities.md) |
| business-rules | ✅ | [`business-rules.md`](business-rules.md) |
| business-logic-model | ✅ | [`business-logic-model.md`](business-logic-model.md) |
| frontend-components | ✅ | [`frontend-components.md`](frontend-components.md) |

## §3. 미해결 질문

없음. 2026-09-28 답변으로 해소했다(DECISIONS).
- Q1 생성 시점 → **신청 마감이 지난 뒤에만.** 마감 전에는 버튼을 비활성하고 "10/15 신청 마감 뒤 생성할 수 있습니다"를 보여 준다. 첫 생성에서 REQUEST_CLOSED → DRAFTING.
- Q2 미리보기 → 핸드오프 우측 아래에 **생성안 격자**(1c 스타일, 신청 반영 칸 빨간 외곽선, 권고 미충족 칸 표시)를 더하고 ‹ n번째 안 › 로 이전 안을 오간다.
- Q3 신청 충돌 → **공평하게 분산.** 한 사람의 이번 달 신청 불충족 수의 최댓값을 먼저 줄이고, 지난 달들에 불충족이 많았던 사람에게 가산점을 준다. 동률은 시드로 끊는다.
- Q4 우선 반영 체크박스 → **생성마다 적용.** 기본값은 규칙 설정 토글, 바꾼 값은 그 안에만 저장한다(규칙 버전은 바뀌지 않음). 검사 결과는 규칙 설정 기준으로 모두 보여 준다.

AI가 정한 사항(READY 승인으로 확정, 설명은 각 아티팩트):
- 공정성(원문 §15 1순위): 목표 OFF = `기준 OFF − 누적 OFF`와 실제 OFF의 **부족분 최댓값 → 부족분 합 → 초과분 합** 순으로 줄인다. 인원이 모자란 달에는 누적 OFF가 음수로 이월된다(A3).
- 슬리핑오프: 한도 `floor((잔여 N + 그달 N)/6)`는 하드, 한도만큼 주지 못하면 벌점(못 준 것은 잔여 N으로 이월).
- 수간호사: 평일 D·빨간 날 OFF 고정(휴가·본인 OFF 신청은 반영). 교대 근무자만으로 인원을 채우는 것을 우선하고, 수간호사 보충(S-HEAD-FILL)은 벌점.
- 프리셉터–신규 동일 근무는 필수 규칙(H-TRAINING)이라 체크박스를 켠 채 비활성으로 둔다(편차 후보, §7에 기록 예정).
- 결정성: `num_workers=1`, `random_seed = seed`, 시드별 작은 동점 깨기 항. 같은 입력·시드면 같은 안.
- 확정 전 입력 해시를 다시 계산해 신청·휴가·규칙·잔여가 바뀌었으면 확정을 막고 다시 생성하게 한다.
- 전월 근무표가 확정되지 않았으면 경계 규칙을 볼 수 없다는 경고와 함께 생성은 허용한다.

## §4. 구현 체크리스트

- [ ] 계약 패키지(zod → JSON Schema) + 생성 스크립트 + 불일치 검사 테스트
- [ ] 솔버 서비스 골격(uv·FastAPI·health) + pnpm 워크스페이스 통합(`pnpm dev`·`pnpm test`)
- [ ] CP-SAT 하드 제약(인원·K-tass·3인 근무·금지 패턴·휴식·N 상한·연속 N·연속 OFF·트레이닝·고정 칸·슬리핑 한도·교육 한도·잔여) + pytest
- [ ] 소프트 목적(공정성 min-max·신청 min-max·수간호사 보충·주말 통 OFF·N 목표·N 후 OFF·슬리핑 부족·분포·저연차·반복 겹침·동점 깨기) + pytest
- [ ] 불가능 진단(가정 리터럴 그룹 → 원인) + pytest
- [ ] 도메인 `generation.ts`(수간호사 고정 칸·고정 칸·목표 OFF·검사 결과 요약) + 테스트
- [ ] 입력 조립(월초 잔여 채움: 누적 OFF·잔여 N·주말 미배정 연속·D/E/N 누적·교육 횟수·잔여치) + 입력 해시 + 통합 테스트
- [ ] 생성 서비스(생성·리롤·재검사·후보 저장·상태 전이) + 확정(해시 비교·칸 복사·출처·CONFIRMED) + 통합 테스트(실제 솔버)
- [ ] **교차 검증:** 11월(가명 시드 + 신청), 신규 3인 기간 달, 연휴 달, 인원 부족 달(불가능 또는 음수 이월) → TS 검사기 하드 위반 0
- [ ] 조회·DTO·액션(adminOnly) + 화면(1i + 격자 미리보기 + 안 이동 + 불가능 원인 + 진행 표시)
- [ ] E2E: 마감 전 비활성 → 마감 뒤 생성 → 결과·요약·격자 → 리롤(2번째 안) → 1번째 안으로 이동 → 확정 → 근무표(S3)에 공개·신청 칸 빨간 외곽선. 입력이 바뀐 뒤 확정 차단
- [ ] 인프라: 운영 compose solver 서비스·Dockerfile, CI Python 잡(ruff·pytest)과 web 잡의 솔버 기동

## §5. 검증 계획

- [ ] `typecheck`·`lint`·`format:check` = 0, ruff 0, 단위·통합·pytest·E2E, 빌드
- [ ] 교차 검증 시나리오 전부 하드 위반 0(CI)
- [ ] 결정성: 같은 입력·시드 두 번 → 같은 칸(pytest)
- [ ] 성능: 11월 시나리오 생성 1회 < 30초(통합 테스트에서 시간 측정), 솔버 시간 제한 준수
- [ ] 보안: 생성·확정 액션 비관리자 거부(정적 가드 테스트 포함), 간호사에게 DRAFTING 안이 보이지 않음(S3·S4 DTO)
- [ ] 수동·시각: 1280×810에서 1i와 비교
- [ ] 실명 검사 0건

## §6. NFR · 성능

| 항목 | 목표 | 확인 |
|---|---|---|
| 생성 1회 | < 30초(솔버 20초 + 조립·재검사·저장) | 통합 테스트 시간 측정 |
| 솔버 시간 제한 | 기본 20초, 환경 변수 `SOLVER_TIME_LIMIT_SEC`로 조정(테스트는 짧게) | pytest |
| 결정성 | `num_workers=1` + 시드 고정 | pytest |
| 가용성 | 솔버가 꺼져 있으면 "솔버에 연결할 수 없습니다" 안내, 기존 후보·확정 기능은 동작 | 통합 테스트(가짜 URL) |
| 메모리 | 솔버 컨테이너 512MB 이내 | 운영 compose `mem_limit` |

## §7. 편차 로그 — 구현 후

(구현 후 기록)

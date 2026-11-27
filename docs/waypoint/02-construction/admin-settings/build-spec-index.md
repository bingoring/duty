---
build-spec: admin-settings
stage: 02-construction/04-admin-settings
status: IMPLEMENTED
depth: standard
updated: 2026-09-27
---

# Build Spec — 2-4 관리자 설정 (S10·S11)

## §0. 개요 & 범위

- **목표(한 줄):** 관리자가 간호사(추가·수정·제거·임시 비밀번호·트레이닝·잔여치)와 규칙(수치·토글·금지 패턴·버전 이력), 공휴일·병원 지정일·개원기념일을
  관리하고, 연초 잔여치 처리가 자동으로 일어나게 한다.
- **SoT:**
  - 화면: 핸드오프 v3 README「S10」「S11」, 프로토타입 `id="1k"`(624~662행)·`id="2b"`(177~213행)·`staff`·`ruleParams`(862~881행)
  - 도메인: [`02-domain-model.md`](../../01-inception/02-domain-model.md) §2 User·Training·Holiday·RuleVersion·BalanceEntry, §4 연 단위 잔여치, §6 불변식
  - 2-2 `@duty/domain`: `RuleSetSchema`·`DEFAULT_RULES`·`PATTERN_REGEX`·`specialLeaveDays`·`employedDaysInYear`·`defaultTrainingEnd`·`defaultTripleStaffUntil`·`foundingOffEligible`
  - 2-1 인증: `generateTempPassword`·`hashPassword`, R-AUTH-14(비활성화 시 세션 삭제)
  - 외부: [한국천문연구원_특일 정보 `getRestDeInfo`](https://www.data.go.kr/data/15012690/openapi.do)
  - 결정: [DECISIONS](../../DECISIONS.md) 2026-09-27 「2-4 관리자 설정 (Q1~Q4)」
- **범위 밖:** 휴가 신청·승인(2-5), 월 마감(2-7), 제거한 간호사 복구(필요해지면 추가), S2 초기 설정(2차).
- **규모/제약:** 간호사 11명 내외. 관리자 1~2명. 모든 쓰기는 서버 액션 + `requireAdmin` + zod 검증.
- **깊이 티어:** `standard` + business-logic-model·frontend-components 모두 — 원장 쓰기·연초 처리·외부 API가 로직의 핵심이고, 두 화면은 폼이 많다.

## §1. 분해

| 단위 | 파일(`apps/web/src/`) | 책임 |
|---|---|---|
| 간호사 서비스 | `server/staff/service.ts` | 목록 조회(역할·트레이닝·연차 계산), 추가(계정·임시 비밀번호·초기 원장·자동 부여·트레이닝), 수정, 제거(소프트 삭제·세션 삭제), 비밀번호 재발급, 잔여치 조정 |
| 규칙 서비스 | `server/rules/service.ts` | 편집 항목 정의(라벨·종류·단위·범위), 검증, 새 버전 저장(diff), 이력 |
| 공휴일 서비스 | `server/holidays/service.ts`, `server/holidays/api.ts` | 목록·추가·삭제, 공공데이터 가져오기(upsert), 개원오프 부여 재계산 |
| 연초 처리 | `server/balances/year-start.ts` | `ensureYearStart(db, today)` — 멱등, advisory lock |
| 서버 액션 | `server/admin/actions.ts` | 위 서비스를 폼에 연결(requireAdmin, zod, revalidatePath) |
| 화면 | `app/(app)/admin/staff/page.tsx`, `admin/rules/page.tsx`, `components/admin/*` | S10·S11 |
| 도메인 보강 | `packages/domain` | `HOLIDAY_SOURCES`에 `api` 추가, 규칙 편집 항목 범위(`RULE_PARAM_LIMITS`) |

## §2. 아티팩트 인덱스

| 아티팩트 | 상태 | 링크 |
|---|---|---|
| domain-entities | ✅ | [`domain-entities.md`](domain-entities.md) |
| business-rules | ✅ | [`business-rules.md`](business-rules.md) |
| business-logic-model | ✅ | [`business-logic-model.md`](business-logic-model.md) |
| frontend-components | ✅ | [`frontend-components.md`](frontend-components.md) |

## §3. 미해결 질문

없음. 2026-09-27 답변으로 해소했다(DECISIONS).
- Q1 추가 패널 → 연차 구분(필수)·노조 여부·근무 방식(기본 교대)·권한(기본 간호사)을 추가 패널과 수정 창에 넣는다.
- Q2 잔여치 → 추가할 때 연차·잔여 N·이월 오프를 입력하고 특휴(산식)·검진 0.5·병가 60·개원오프(대상이면)를 자동 부여. 이후 수정 창 "잔여치 조정"(원장 `admin_adjust` + 메모).
- Q3 공휴일 → 공공데이터 특일 정보 API로 가져온다(인증키는 `.env`의 `HOLIDAY_API_KEY`, 사용자가 발급). 병원 지정일·노사 협의일·개원기념일은 규칙 설정 화면의 "공휴일·병원 지정일" 섹션에서 입력.
- Q4 연초 처리 → 자동. 새해 첫 요청에서 실행하되 전년 12월이 확정·미마감이면 마감 뒤로 미룬다.

AI가 정한 사항(READY 승인으로 확정): 사번은 추가 후 바꿀 수 없다. 트레이닝 시작일 = 입사일. 제거는 자기 자신·마지막 관리자에게 불가.
규칙의 운영 수치(마감일·협의 기간)는 이후 새로 만드는 달 계획부터 적용(이미 만든 달은 S9에서 달별로 수정). "저연차만 배정 방지" 설명은 연차 구분 기준으로 고친다(핸드오프의 "3년차 이상"은 쓰지 않음).

## §4. 구현 체크리스트

- [x] 도메인: `HOLIDAY_SOURCES` + `api`, `RULE_PARAM_LIMITS`·`validateRuleSet`(범위·상호 제약) + 테스트
- [x] 간호사 서비스 + 통합 테스트(추가·중복 사번·초기 원장·자동 부여·트레이닝 기본값·수정·제거·세션 삭제·재발급·잔여치 조정·자기/마지막 관리자 제거 금지)
- [x] 규칙 서비스 + 테스트(범위 검증·diff·버전 증가·이력·운영 수치 상호 제약·금지 패턴 정규화)
- [x] 공휴일 서비스 + API 어댑터(가짜 fetch로 테스트: 분류 매핑·upsert·관리자 항목 보존·키 없음·API 오류) + 개원오프 재계산
- [x] 연초 처리 + 통합 테스트(멱등·12월 미마감이면 연기·계정별 리셋·특휴 산식·동시 실행)
- [x] 서버 액션(requireAdmin·zod) + S10·S11 화면
- [x] E2E: 간호사 추가 → 임시 비밀번호 1회 표시 → 그 계정 첫 로그인, 제거, 규칙 저장 → 이력·근무표 하단 문구 반영, 병원 지정일 추가 → 근무표 빨간 날, 간호사는 403

## §5. 검증 계획

- [x] `typecheck`·`lint`·`format:check` = 0
- [x] 단위: 도메인 규칙 검증, 역할 판정, 공휴일 분류
- [x] 통합(실제 Postgres): 간호사·규칙·공휴일·연초 처리 서비스
- [x] E2E: §4 마지막 항목
- [x] 수동·시각: 1280×760에서 1k·2b와 비교
- [x] 보안: 모든 액션이 간호사 세션에서 거부(통합 테스트로 액션 가드 확인), 임시 비밀번호는 로그·DB에 평문이 없음
- [x] 공개 저장소 점검: 실명 검사 0건, `HOLIDAY_API_KEY`가 커밋되지 않음

## §6. NFR · 성능

standard 티어 — 공휴일 API는 타임아웃 5초, 실패 시 기존 데이터를 그대로 둔다.

## §7. 편차 로그 — 구현 후

| SoT | 실제 구현 | 사유 |
|---|---|---|
| business-rules §1.4 (연초 처리) | **R-YEAR-7 추가**: 원장이 모두 올해 생성됐으면(시스템 첫해) 처리하지 않는다 | 구현 중 발견. 첫해 첫 요청에서 관리자가 올해 값으로 넣은 연차가 0으로 지워진다 |
| R-STAFF-ADD-4 "특휴 = 입사일 또는 오늘부터" | 입사일이 없으면 1년 재직(5일)으로 계산 | 입사일 없이 등록하는 사람은 기존 직원이다(§5 엣지케이스와 일치시킴) |
| R-YEAR-3 | 연차 `year_reset`은 0이어도 넣는다 | 그해 처리 여부의 표식(R-YEAR-1)이 사용자 수와 무관하게 남도록 |
| §5 "보안: 통합 테스트로 액션 가드 확인" | 정적 테스트: 모든 액션에서 `await adminOnly()`가 다른 어떤 `await`보다 먼저, 실패 시 즉시 거부 + E2E 간호사 403 | 서버 액션은 Next 요청 문맥(쿠키)이 필요해 통합 테스트에서 직접 부를 수 없다 |

**검증 결과 (2026-09-27)**: format·typecheck·lint 0 · 단위 298(domain 227 + web 71) · 통합 77 · `next build` 성공 · E2E 22 · 실명 검사 0건 · `HOLIDAY_API_KEY` 미커밋.
- 1280×760(S10)·1280×820(S11) 스크린샷을 1k·2b와 비교: 표·추가 패널·수치 행·태그·토글·금지 패턴·이력 배치 일치.
- 개발 모드 오류 배지 조사: Playwright 스크린샷이 하이드레이션 전에 `caret-color`를 넣어 생긴 불일치였다(앱 결함 아님). 스크린샷에 `caret: 'initial'`을 주고 전체 E2E 중 개발 서버 오류 0건을 확인했다.

- CI 실패 1건(병원 지정일 E2E)을 조사했다: 느린 CI에서 하이드레이션 전에 입력한 날짜가 사라졌다(로컬에서 CPU 20배 제한으로 재현). 관리자 폼에
  `data-hydrated` 표시(`useHydrated`, `useSyncExternalStore`)를 달고 E2E는 표시가 붙은 뒤 입력하도록 고쳤다. CPU 20배 제한에서도 통과, CI 그린.

**운영 메모**
- 공휴일 가져오기는 `HOLIDAY_API_KEY`(공공데이터포털 Decoding 키)가 있어야 켜진다(README).
- 제거한 간호사 복구는 범위 밖이다. 사번을 재사용할 수 없으므로 실수로 제거하면 DB에서 `active`를 되돌려야 한다.

---
build-spec: domain-core
stage: 02-construction/02-domain-core
status: IMPLEMENTED
depth: comprehensive
updated: 2026-09-27
---

# Build Spec — 2-2 Domain Core

## §0. 개요 & 범위

- **목표(한 줄):** `@duty/domain`에 규칙 검사기·인원 집계·월 정산·특휴 산식·셀 출처·근무표 상태 전이를 순수 TS로 만들고,
  종이 근무표 2026-10(가명) fixture로 검증한다.
- **SoT:**
  - 규칙: [`requirements_v3.md`](../../inputs/requirements_v3.md) 간호부 지침 §1~§6, 야간 운영 지침 §1~§3, 응급실 지침 §1~§14
  - 도메인: [`02-domain-model.md`](../../01-inception/02-domain-model.md) §0 정산 부호, §3 상태 전이, §4 정산·잔여치, §5 셀 출처, §7 인원 계산, §9 검사기 계약
  - 구조: [`03-architecture-decision.md`](../../01-inception/03-architecture-decision.md) §1 모노레포(`fixtures/`), §3 "TS 검사기가 규칙의 SoT", §4 검사기 공유, §7 NFR
  - 규칙 수치·문구: 핸드오프 README「S7」「S8」「S9」「S11」, 2-1 `DEFAULT_RULES`
  - 검증 데이터: [`paper-2026-10-settlement-check.py`](../../01-inception/evidence/paper-2026-10-settlement-check.py)
- **범위 밖:** DB 조회·조립(각 화면 스테이지), 솔버·계약 패키지(2-6), 셀 편집 시 대체자 추천(2-7), 신청 단위 검증(연 2회 노조교육 등 연간 횟수, 월 OFF 신청 상한 — 2-5).
- **규모/제약:** 11명 × 31일. 브라우저 번들에 들어가므로 Node 전용 API 금지(zod만 의존).
- **깊이 티어:** `comprehensive` — 1-3 §10 지정. 규칙 오류는 생성기·조정·정산 전부에 퍼지고, 정산은 원장에 영구히 남는다.
  frontend-components는 N/A(화면 없음).

## §1. 분해

| 단위 | 파일(`packages/domain/src/`) | 책임 | 의존 |
|---|---|---|---|
| 날짜 | `dates.ts` | IsoDate 검증·산술·요일·월 날짜·빨간 날·재직 판정 | — |
| 입력 타입 | `types.ts` | `NurseProfile`·`TrainingSpan`·`HolidayDay`·`GridCell`·`RequestEntry`·`ScheduleInput`·`DomainInputError` | allowed-sets |
| 격자 | `grid.ts` | 색인·토큰·타임라인·`requiredTailDays` | dates, types |
| 인원 | `staffing.ts` | `countStaff`, 트레이닝 기간 판정 | grid |
| 검사기 | `checker/{index,rules,hard,soft,format}.ts` | `checkSchedule`, 규칙 ID allowed-set, `formatViolation` | grid, staffing |
| 정산 | `settlement.ts` | `baselineOff`, `settleMonth`, `reverseEntries`, `summarizeNurse`, `hasWeekendPair` | dates, grid |
| 휴가 산식 | `leave.ts` | `employedDaysInYear`, `specialLeaveDays`, `foundingOffEligible` | dates |
| 셀 출처 | `cell-source.ts` | `resolveCellSource`, 신청 만족 판정(검사기와 공유) | types |
| 근무표 상태 | `month-plan.ts` | `defaultPlanDates`, `nextPlanStatus`, `canNurseEditRequests` | dates |
| fixture | 저장소 루트 `fixtures/paper-2026-10.json` | 가명 10명 + 수간호사, 10월 칸, 이월값, 종이의 누적 off | — |

- 기존 `schemas.ts`의 `PATTERN_REGEX`·`normalizePattern`을 재사용한다. `index.ts`는 새 모듈을 모두 re-export한다.
- `fixtures/`는 1-3 §1의 공유 테스트 데이터 위치다(2-6 pytest도 같은 파일을 읽는다). 가명만 쓴다.

## §2. 아티팩트 인덱스

| 아티팩트 | 상태 | 링크 / N/A 사유 |
|---|---|---|
| domain-entities | ✅ | [`domain-entities.md`](domain-entities.md) |
| business-rules | ✅ | [`business-rules.md`](business-rules.md) |
| business-logic-model | ✅ | [`business-logic-model.md`](business-logic-model.md) |
| frontend-components | N/A | 화면을 만들지 않는다. 문구 형식(`formatViolation`)만 business-logic-model §2.6에 둔다 |

## §3. 미해결 질문

없음. 2026-09-27 답변으로 모두 해소했고 [DECISIONS](../../DECISIONS.md)에 기록했다.
- Q1 수간호사 인원 → 평소에는 넣지 않고, 교대 근무자만으로 모자라면 **최후의 수단**으로 수간호사 D를 인원·K-tass에 센다. 하드 위반 대신 소프트 `S-HEAD-FILL`로 표시하고, 솔버는 큰 벌점으로 피한다(2-6).
- Q2 연속 오프 → 10일은 간호사 사이의 구두 합의이고 규정상 한도는 15일이다. **`maxConsecutiveOff` 기본값을 15로** 바꾸고 관리자가 규칙 설정(S11)에서 수정한다. LEAVE는 세지 않되 연속을 끊지 않는다(기본안 유지, 답변에서 따로 언급 없음).
- Q3 금지 패턴 → 쉬는 칸(OFF·연차·휴가)은 모두 off로 본다.
- Q4 트레이닝 → 둘 중 한 명이 연차·휴가인 날은 예외.
- Q5 3인 근무(추가 답변) → 3인 = 신규 + 프리셉터 + 그 외 1명. 3인 배정 기간은 **완전 신규 3주, 타 병원 경력자 2주**. 기간이 지나도
  **그 뒤 신규가 처음 서는 N 3개**는 3인으로 근무한다(떨어져 있어도 순서대로 셈). → `Training.kind`, 규칙 수치 `experiencedTripleWeeks`(2)·`tripleNightCount`(3) 추가.

AI가 정한 사항(READY 승인으로 함께 확정):
- 16시간 휴식은 **서로 다른 근무 코드 사이**에만 적용한다(종이의 D-D 15.5h, N-N 15h). S→D(13h)·N→S(1.5h)도 위반이다.
- D→E→N 순환은 별도 검사하지 않는다(종이에 E-OFF-D가 있고, 직접 역행은 금지 패턴·휴식이 잡는다). 솔버 소프트 항으로 넘긴다.
- 반복 겹침 경고 기준 = `max(4, ceil(2 × 쌍 평균))`(종이 기준 5회). 규칙 설정(S11)에 항목이 없으므로 코드 상수로 둔다.
- 주말 통 OFF = 토·일 두 날이 모두 쉬는 칸. 월 경계에 걸친 주말은 토요일이 속한 달로 센다(구현 후 사용자 답변으로 변경, §7).
- `special` 신청(연차·교육) 미반영은 하드, 근무 옵션 신청 미충족은 소프트다.
- 전월 꼬리 길이 = `requiredTailDays(rules)`(기본값 기준 15일). 1-2 §9의 "전월 말 3일"로는 연속 오프 상한을 잡을 수 없다.

## §4. 구현 체크리스트

**기반**
- [x] `DEFAULT_RULES.maxConsecutiveOff` 10 → 15 (Q2) + 기존 테스트 갱신. 개발 DB의 `rule_versions` v1은 이미 10이므로 README에 재시드 안내
- [x] `RuleParams`에 `experiencedTripleWeeks`(2)·`tripleNightCount`(3) 추가(zod 기본값으로 기존 v1 행도 읽힘), `TRAINEE_KINDS`, web `getCurrentRules`가 스키마로 파싱
- [x] DB 마이그레이션: `trainings.kind text not null default 'new_grad'`
- [x] `dates.ts` + 테스트(윤년, 월말, 2026-10-01 = 목, 문자열 비교 재직 판정)
- [x] `types.ts`·`grid.ts` + `requiredTailDays`·토큰 테스트
- [x] `fixtures/paper-2026-10.json`(가명) + 로더 테스트(31칸 × 10명, 합계가 evidence 스크립트와 일치)

**검사기**
- [x] `staffing.ts` + 테스트(3인 배정 기간 신규 3주·경력 2주, 3인 나이트 3개(떨어진 N·월 경계 `tripleNightsBefore`·트레이닝 종료), K-tass 제외, S 미집계, 퇴사자 제외)
- [x] 하드 규칙 12종 — 규칙마다 통과·위반·월 경계 케이스
- [x] 소프트 규칙 6종 + 토글 꺼짐 케이스
- [x] `checkSchedule` 정렬·결정성·입력 오류 throw
- [x] `formatViolation` 문구 스냅샷(핸드오프 S8·S9 예시 문구와 대조)

**정산·기타**
- [x] `settlement.ts` + 종이 10명 `offCarryAfter` 일치, 원장 증감·역분개 합 0, 수간호사 0
- [x] `leave.ts` + 특휴 경계값 36/37·109/110·182/183·255/256·328/329·365·366, 연중 입사·퇴사
- [x] `cell-source.ts` + 1-2 §5 규칙별 케이스
- [x] `month-plan.ts` + 허용·거부 전이 전체, 기본 날짜(2월 말일 보정)
- [x] `index.ts` re-export, 기존 테스트 유지

## §5. 검증 계획

- [x] `pnpm typecheck`·`pnpm lint`·`pnpm format:check` = 0
- [x] 단위(Vitest, `packages/domain`): 위 체크리스트의 규칙별 테스트. 규칙 테스트는 작은 격자 빌더(`grid('D E N O …')`)로 작성해 읽기 쉽게 한다
- [x] **종이 fixture 통합 테스트:** `settleMonth` 10명 누적 OFF = 종이 값, `checkSchedule` 결과가 business-rules §6의 사실과 일치(하드 0 / 소프트: 수간호사 보충 1(10/2 D), N-OFF-E 2, N 7개 2, 주말 미배정 5, 반복 겹침 5. 수간호사 행은 평일 D·빨간 날 빈칸으로 fixture에 넣는다)
- [x] 무작위 격자 속성 테스트(고정 시드 PRNG 200개): 예외 없음, 입력 순서를 섞어도 결과 동일(INV5), 역분개 합 0(INV4)
- [x] 성능: 11×31 격자 `checkSchedule` 100회 평균 < 5ms(Node) — 브라우저 50ms 목표의 여유 확인
- [x] 브라우저 호환: `packages/domain`이 `node:*` 모듈을 import하지 않음(테스트로 소스 grep)
- [x] 공개 저장소 점검: 실명 검사 스크립트 0건

## §6. NFR · 성능

| 항목 | 목표 | 측정 |
|---|---|---|
| 검사 지연 | 11×31 전체 검사 브라우저 < 50ms(1-3 §7), Node 평균 < 5ms | Vitest 성능 테스트 |
| 결정성 | 같은 입력 → 같은 결과(정렬 포함) | 속성 테스트 |
| 번들 | 브라우저 번들 가능(Node API 없음), 의존성 zod만 | grep 테스트 |
| 정확성 | 정산은 종이 10명 전원 일치 | fixture 테스트 |

## §7. 편차 로그 — 구현 후

| SoT | 실제 구현 | 사유 |
|---|---|---|
| 핸드오프 S11·S7 최대 연속 오프 기본값 10일 | 기본값 15일(관리자 수정 가능) | 2026-09-27 사용자 답변: 10일은 구두 합의, 규정상 한도는 15일 (Q2) |
| 1-1 Q3 수간호사는 인원·K-tass에서 제외 | 교대 근무자만으로 모자랄 때만 수간호사 D를 세고 소프트 경고 `S-HEAD-FILL` | 2026-09-27 사용자 답변: "정말 안 되면 넣는" 최후의 수단 (Q1) |
| 1-2 §9 전월 말 3일 | 전월 꼬리 `requiredTailDays`(기본값 기준 15일) | 연속 오프 상한을 월 경계에서 잡기 위해 |
| 1-2 §2 Training `tripleStaffUntil` 기본 start+3주 | 신규 종류별 기본값(완전 신규 3주·경력자 2주) + 기간 뒤 첫 N 3개도 3인 | 2026-09-27 사용자 추가 설명 (Q5) |
| business-rules S-OFF-AFTER-N·logic-model §2.4 "대상 월 안에서 끝나는 N 구간" | 전월 꼬리에서 끝난 N 구간도 본다(10/31 N → 11/1 OFF → 11/2 E를 11월에 경고) | 구현 중 사용자 설명: "다음 달이 되어도 이전 달을 많이 고려해야 한다". 11월 기준 월 경계 테스트 5건 추가 |
| logic-model §2.6 `formatViolation(v, nameOf)` | `formatViolation(v, { nameOf, month })` | 주말 통 OFF 문구("9월도 미배정 → 11월 최우선")에 대상 월이 필요하다 |
| business-rules H-CELL 단위 "사람·날짜" | 사람·종류(`missing`/`outside`)별 1건, 날짜 목록 | 칸 누락이 여러 날이면 경고가 수십 건으로 늘어난다 |
| S-NIGHT-TARGET "N > 목표이면서 하드 상한 이하" | 야간 전담 적용 중인 사람에게는 내지 않는다 | 목표 6개는 비전담 기준(야간 지침 §1) |

| READY 결정 "월 경계에 걸친 주말은 세지 않는다" | 토요일이 속한 달로 센다. 다음 달 1일 칸이 없으면 달성 예정, 다음 달 검사에서 `S-WEEKEND-CARRY` | 2026-09-27 사용자 답변 |
| (신규) | 소프트 `S-SHIFT-BALANCE`: 한 사람의 D·E·N 차이 > 2, 토글·허용치는 규칙 설정 | 2026-09-27 사용자 요청: 종이로 할 때 D만·E만 서는 사람이 있어 불만 |

| 이월 입력 = 전월 꼬리·`weekendPairMissedLastMonth`(1개월)·잔여 N·누적 OFF | 이월 관점 확장: 다음 달 앞쪽 칸(`nextHead`)으로 앞 달 수정 시 경계 규칙 검사, 주말 미배정 연속 개월 수, D·E·N 3개월 누적, 교육 연간 횟수(`H-EDU-LIMIT`), 잔여 초과(`H-BALANCE`) | 2026-09-27 사용자 설명: "10·11월은 예시, 이월되는 것에 대해 많은 것을 고려" |

**검증 결과 (2026-09-27, 이월 확장 후)**: format·typecheck·lint 0 · 단위 230(domain 192 + web 38) · 통합 35 · `next build` 성공 · E2E 9 · 실명 검사 0건.
- 종이 10월: 10명 누적 OFF 전원 일치, 하드 위반 0, 소프트 = 수간호사 보충 1(10/2 D)·N-OFF-E 2·나이트 7개 2·주말 미배정 2(10/31 OFF인 3명은 달성 예정)·반복 겹침 5쌍(기준 5)·D/E/N 분포 1(강도윤 D 4·E 7·N 6).
- 속성 테스트(시드 200개): 입력 순서를 섞어도 결과 동일. 사용자 id 정렬을 일부러 지운 코드에서는 실패하는 것을 확인했다.
- 성능: 11×31 검사 100회 평균 < 5ms(Node). 비테스트 소스에 `node:*` import 없음.

**후속 스테이지로 넘기는 사항**
- 2-4: S10 신규 등록에 신규 종류(완전 신규/경력자) 선택, `tripleStaffUntil` 기본값은 `defaultTripleStaffUntil`. S11에 `experiencedTripleWeeks`·`tripleNightCount` 항목 추가.
- 2-5: S4 "기준 OFF + 이월 = 최대" 카드는 D1 부호(양수 = 더 쉼)와 반대이므로 `기준 − 누적 + 슬리핑오프 가능 수`로 다시 정한다. 노조교육 연 2회·보수교육 연 1회는 신청 단계에서 검증한다.
- 2-6: 솔버는 `S-HEAD-FILL`에 큰 벌점을 주고, 3인 나이트는 `tripleNightsBefore`로 월을 넘어 이어 센다. 서버는 전월 확정본에서 `requiredTailDays`일의 꼬리와 `tripleNightsBefore`를 조립한다.
- 2-7: `month_settlements`에 `edu_union` 컬럼이 없다(원장에는 기록). 휴가 승인 시 원장 차감(`leave_approved`)과 월 정산 차감이 겹치지 않도록 S5에서 한쪽만 쓴다.
- 2-4: S11에 토글 `balanceShiftTypes`(D/E/N 고르게)와 수치 `shiftBalanceTolerance`(2)·`shiftBalanceWindowMonths`(3)·`eduContPerYear`(1)·`eduUnionPerYear`(2) 항목 추가.
- 2-6·2-7: 서버는 `weekendPairCarryIn`·`weekendPairMissedStreak`·`shiftCountsBefore`(최근 2개월)·`eduUsedThisYear`·`balancesBefore`(마감 안 된 앞 달 사용분 차감)를 조립하고, 다음 달 확정본이 있으면 앞쪽 `requiredTailDays`일을 `nextHead`로 넣는다. 솔버는 D·E·N 차이를 줄이는 소프트 항과, carry-in인 사람의 1일 OFF에 큰 가중치를 둔다.

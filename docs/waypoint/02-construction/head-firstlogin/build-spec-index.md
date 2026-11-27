---
build-spec: head-firstlogin
stage: 02-construction/11-head-firstlogin
status: IMPLEMENTED
depth: standard
updated: 2026-10-09
---

# Build Spec — 2-11 수간호사 S·칸 출처 표시·최초 로그인(동의·초기 설정)

## §0. 개요 & 범위
- **목표(한 줄):** 운영 이력 가져오기 전에 수간호사 기본 S, 교환에 수간호사, 칸 출처 외곽선·툴팁, 최초 로그인 동의·초기 설정을 넣는다.
- **SoT:** 사용자 요청·답변(2026-10-09), 원문 §10·11·응급실 §5~7, 핸드오프 S1·S2·S3, 개인정보 보호법 제15·22·23조.
- **규모/제약:** 새 테이블 2개(`privacy_consents`, `onboarding_submissions`), 원장 사유 1개 추가, 솔버 계약 확장(`heads[].cells[].flex`, 결과 `headFill`). 확정·마감된 달은 건드리지 않는다.
- **깊이 티어 & 사유:** `standard` — 인증 흐름·솔버·원장을 함께 건드리지만 각각 기존 구조를 확장한다.

## §1. 분해

| 단위 | 책임 | 의존 | 신규/기존 |
|---|---|---|---|
| `headCells` (`packages/domain/src/generation.ts`) | 평일 기본 S, 신청 D·OFF 반영(R-HEAD-1·2) | 2-6 | 수정 |
| 계약 `SolverHead.cells[].flex`, 응답 `headFill` (`packages/contract`) | 보충 가능한 수간호사 칸·솔버가 D로 바꾼 날짜 | zod → JSON schema → codegen | 수정 |
| `model.py` staffing·`weights.py` | flex 칸 S/D 변수, `headD` 20000, `headFill` 항 제거(R-HEAD-3·4) | 2-6 | 수정 |
| `assembleCells`·생성 저장 | 솔버 결과의 수간호사 D 반영, 메타 `headFill` 저장(R-HEAD-5) | 위 | 수정 |
| `staffing.count` (domain) | 수간호사 몫은 D·E·N만(R-HEAD-6) | — | 확인·테스트 |
| 신청 화면·서비스 (`requests/load.ts`, `service.ts`) | 수간호사 행, OFF·D만(R-HEAD-2) | 2-5 | 수정 |
| `swappable`·`sameCounts` (domain `swap.ts`), `createSwap`·`respondSwap` | 수간호사 S↔D, S를 OFF로 세기, 수간호사 응답(R-SWAPH-1~4) | 2-8 | 수정 |
| `NurseAdjust`·`AdjustScreen`·`adjust/view.ts` | 수간호사 행·선택, 관리자 화면 받은 요청 패널 | 2-7·2-8 | 수정 |
| `cellView`·`ScheduleGrid`·`CellTip`·`Legend` | 외곽선 3종·휴가 외곽선·툴팁 줄(R-MARK·R-TIP) | 2-3 | 수정·신규 |
| `loadMonthView` 툴팁 데이터 | 칸별 최신 편집 기록·교환·신청·휴가를 한 번에 조회, 보는 사람별 가리기 | 2-3 | 수정 |
| `privacy_consents`·`PRIVACY_NOTICE`(버전·문안) | 동의 기록·문안 원천(R-CONSENT) | — | 신규 |
| `guards.ts`·`actions.ts` 로그인 목적지 | 단계 순서 동의 → 비밀번호 → 초기 설정(R-ONB-1), 서버 액션 공통 가드 | 2-1, R-1 | 수정 |
| `/consent`·`/privacy`·`/onboarding` | 화면 | 위 | 신규 |
| `onboarding/service.ts` | 미리 채우기(원장 투영), 저장(users·원장 `self_input`·trainings·제출 기록), 연차만 모드 | `requests/balance.ts`, 원장 | 신규 |
| `staff/service.ts`·`StaffManager` | 미확인 제출 배지·확인·되돌리기(R-ONB-7), 동의 여부 열 | 2-4 | 수정 |
| `BALANCE_REASONS += self_input` | 원장 사유 | allowed-set(추가만) | 수정 |
| 시드(dev·E2E·bootstrap) | 시드 사용자 동의·초기 설정 완료, 첫 로그인용 1명(R-ONB-10) | — | 수정 |
| 규칙 안내 문구 | 외곽선 안내(R-MARK-3) | 2-10 | 수정 |

## §2. 아티팩트 인덱스
| 아티팩트 | 상태 | 링크 / N/A 사유 |
|---|---|---|
| domain-entities | 인라인 | 아래 §2.1 |
| business-rules | ✅ | [`business-rules.md`](business-rules.md) |
| business-logic-model | 인라인 | 아래 §2.2 |
| frontend-components | ✅ | [`frontend-components.md`](frontend-components.md) |

### §2.1 엔티티 변경 (마이그레이션 0006)
- `privacy_consents`: id, user_id → users, version text, required_at tstz, sensitive_at tstz, ip text null, created_at. 인덱스 (user_id, version).
- `onboarding_submissions`: id, user_id → users, year int, kind text(`initial`·`annual`), before jsonb, after jsonb, submitted_at, reviewed_at null, reviewed_by null → users, review text null(`confirmed`·`reverted`), review_note text null.
- `balance_entries.reason` 허용 값에 `self_input`(텍스트 컬럼, 코드 allowed-set만 추가).
- `generation_runs`(또는 생성안 메타)에 `head_fill` 날짜 목록 jsonb — 기존 메타 컬럼이 있으면 그 안에 넣는다.
- `users.onboarded_year`(이미 있음, 처음으로 쓴다).

### §2.2 흐름
- **로그인 목적지:** `nextStep(session)` = 동의 없음 → `/consent` · `mustChangePassword` → `/password` · `onboardedYear` null → `/onboarding` · `onboardedYear < 올해` → `/onboarding?annual` · 아니면 요청한 곳. 페이지 가드와 서버 액션 가드가 같은 함수를 쓴다. 단계 화면 자신은 해당 단계만 허용한다.
- **초기 설정 저장(한 트랜잭션, 사용자 잠금):** 현재 값 다시 읽기 → 차이 계산 → users 갱신 → 잔여 차이마다 원장 `self_input` → 트레이닝 만들기·고치기 → 차이가 있으면 제출 기록 → `onboardedYear = 올해`.
- **되돌리기:** 제출 기록의 before로 users·trainings 복원, 잔여는 반대 부호 `admin_adjust`(메모 필수), 제출 `review = reverted`.

## §3. 미해결 질문
없음. 사용자 답변 4건(수간호사 D 조건, 미리 채우고 본인 확인·수정, 교환 = 빨간 점선, 동의서 초안 → 병원 검토)은 DECISIONS 2026-10-09로 이관.

AI가 정한 사항(READY 승인으로 확정):
- 수간호사 보충 벌점 20000(필수 조건 외에는 쓰지 않음), 기존 `S-HEAD-FILL` 제거(R-HEAD-3·4).
- "조정신청을 받은 경우"를 **간호사가 수간호사를 넣은 교환 요청을 수간호사가 수락한 경우**로 해석(R-SWAPH). 수간호사 칸은 S↔D만.
- 휴가·특수 신청 칸도 빨간 실선(R-MARK-2, R-VIEW-6 변경).
- 툴팁은 즉시 뜨는 카드(브라우저 `title`은 1초 가까이 늦고 휴대폰에서 안 보임).
- 초기 설정에 "나중에" 없음, 바뀐 값만 관리자 확인 대상, 해마다 1월에는 연차만 다시 묻는다(R-ONB-4·7·9).
- 동의 2개(필수 + 민감정보 별도), 보유 기간 퇴직 후 3년, 위탁 Google Cloud 명시(§7 초안).

## §4. 구현 체크리스트
순서: 표시(3·4) → 수간호사(1·2) → 동의(6) → 초기 설정(5).
- [x] `cellView` 외곽선 3종·휴가 외곽선, 범례, 규칙 안내 문구 + 단위 테스트
- [x] 툴팁 데이터 조회(보는 사람별 가리기) + `CellTip` + 단위·통합 테스트(간호사는 남의 사유 안 보임)
- [x] `headCells` S 기본·신청 D + 수간호사 신청 행(OFF·D) + 테스트
- [x] 계약 `flex`·`headFill` + codegen, 솔버 `headD`·`headFill` 제거 + pytest(평소엔 S 유지, 인원 부족한 날만 D, 신청 D는 인원에 셈)
- [x] `assembleCells`·생성 저장·툴팁 "인원 부족 보충"
- [x] 교환: `swappable`·`sameCounts` 수간호사 규칙, 서비스 완화, 간호사 화면 행, 관리자 받은 요청 패널 + 단위·통합 테스트
- [x] 마이그레이션 0006, `PRIVACY_NOTICE`, `/consent`·`/privacy`, 가드 단계 + `page-guards.test.ts` 확장(서버 액션 포함)
- [x] `/onboarding` 미리 채우기·저장·연차만 모드, 원장 `self_input` + 통합 테스트(차이만 기록, 트레이닝 생성, 동시 저장)
- [x] 간호사 관리 배지·확인·되돌리기 + 통합 테스트
- [x] 시드·`importHistory`(`onboardedYear` null 확인)·E2E 시드 갱신
- [x] E2E: 첫 로그인(동의 거부 → 로그아웃, 동의 → 비밀번호 → 초기 설정 → 근무표, 관리자 배지 → 되돌리기), 칸 툴팁·외곽선, 교환에 수간호사(S→D 수락), 수간호사 D 신청

## §5. 검증 계획
- [x] format·typecheck·lint·ruff 0, 단위 409(domain 280 + web 128 + contract 1) · pytest 19 · 통합 162
- [x] E2E 43 그린(worktree), `next build` 성공, 실명 검사 0건
- [x] 실제 이력 묶음으로 버리는 DB에 다시 가져오기 → 14명·칸 3,299·이월 조정 9·차이 기록 9건으로 이전과 같음(가져오기 코드는 바뀌지 않음, 수간호사 칸은 엑셀 값 그대로)
- [x] 시각: 동의·초기 설정·툴팁은 E2E로 흐름만 확인(프로토타입과 픽셀 대조는 하지 않음 — 핸드오프에 동의 화면이 없다)

## §6. NFR · 성능
- 근무표 조회 쿼리 추가는 달 단위 3개(편집 기록 최신 1건씩, 교환 요청, 신청) 이내.
- 동의 IP는 `clientIp`(3-1 `ip-limit.ts`)와 같은 판정. 동의서 문안·버전은 코드 상수(배포로만 바뀜).

## §7. 편차 로그 (Deviations) — 구현 후

| SoT | 실제 구현 | 사유 |
|---|---|---|
| 2-10 Q1 「S2 초기 설정은 만들지 않는다」 | S2를 만든다(본인 확인·수정 + 관리자 확인·되돌리기) | 사용자 결정 2026-10-09(DECISIONS) |
| 2-3 R-VIEW-6 「휴가 칸 외곽선 없음」 | 휴가·특수 신청 칸도 빨간 실선, 교환은 빨간 점선 | R-MARK-1·2 |
| 2-8 R-SWAP-2 「교대 근무자끼리만」 | 수간호사 S↔D 포함 | R-SWAPH-1 |
| 핸드오프 S3 「수간호사 평일 D만」 | 평일 S 기본 | R-HEAD-1 |
| 핸드오프 S2 「나중에」 버튼 | 없음 | 값이 미리 채워져 확인만 하면 된다 |
| R-ONB-4 「잔여치는 원장 투영 `requests/balance.ts`」 | 근무표와 같은 오늘 달 월말 예정(`loadLeaveBalance`), 칸 아래 "{M}월 말 기준" | 본인이 근무표에서 보는 값과 같아야 비교할 수 있다. 고친 차이만 원장에 쌓으므로 기준이 달라도 결과는 같다 |
| §2.1 `generation_runs`에 `head_fill` | 생성안 `solverMeta.headFill`(이미 있는 jsonb), 근무표는 확정한 생성안에서 읽고 아직 자동 D로 남은 칸만 "인원 부족 보충" | 새 컬럼 없이 같은 정보 |
| R-MARK-2 「휴가 승인·취소로 바뀐 칸은 신청으로」 | 승인은 `requested`, **승인 취소로 되돌린 칸은 `admin`(파랑)** | 취소는 관리자가 한 일이고, 되돌린 칸을 신청 빨강으로 보이면 오해한다 |
| R-TIP-1 「툴팁 위치 공간이 없으면 아래」 | 화면 위에서 90px 안이면 아래 | 고정 헤더 높이 |
| R-ONB-1 초기 설정 해(onboardedYear) | 실제 서울 날짜의 해(E2E 가짜 시계 무관) | 세션 단계 판정이 요청 문맥 밖이라 가짜 시계를 모른다 — 둘이 어긋나면 해마다 화면이 반복된다 |
| frontend-components 관리자 「받은 교환 요청」 패널 | 근무 조정(관리자) 상단, 응답할 수 있는 요청이 있을 때만 | 평소 화면을 가리지 않게 |

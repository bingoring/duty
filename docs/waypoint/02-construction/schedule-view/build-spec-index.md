---
build-spec: schedule-view
stage: 02-construction/03-schedule-view
status: READY
depth: standard
updated: 2026-09-27
---

# Build Spec — 2-3 근무표 조회 (S3)

## §0. 개요 & 범위

- **목표(한 줄):** 로그인 첫 화면 S3 — 병동 한 달 근무표 격자(1c 내 줄 강조형)·요약 카드 5개·월 이동·인쇄를, 원장과 `@duty/domain` 정산으로 계산한 이월 값과 함께 보여 준다.
- **SoT:**
  - 화면: 핸드오프 README「S3」, 프로토타입 `id="1c"`(마크업 237~291행, 스타일 JS 600~665행)
  - 확정 사항: 핸드오프「확정된 결정 사항」2~5
  - 데이터·정산: [`02-domain-model.md`](../../01-inception/02-domain-model.md) §2 MonthPlan·ShiftCell·BalanceEntry·MonthSettlement, §4 종이 우측 컬럼 매핑, §8 권한
  - 계산: 2-2 `@duty/domain`(`settleMonth`, `baselineOff`, `redDaySet`, `foundingOffEligible`, `SHIFT_TIMES`, `defaultPlanDates`)
  - 결정: [DECISIONS](../../DECISIONS.md) 2026-09-27 「2-3 근무표 조회 (Q1~Q4)」
- **범위 밖:** 근무 신청 격자(2-5), 생성안 조회(2-6 S8), 셀 편집(2-7 S9), 월 마감(2-7), 동료 현황 S6(2차).
- **규모/제약:** 11행 × 최대 31열. 데스크톱 1280px. 서버 응답 p95 < 300ms(1-3 §7). 인쇄는 A4 가로 1장.
- **깊이 티어:** `standard` + business-logic-model·frontend-components 모두 — 이월 값 계산(원장 + 마감 안 된 달 투영)이 로직의 핵심이고, 화면은 1c 픽셀 재현이 핵심이다.

## §1. 분해

| 단위 | 파일(`apps/web/src/`) | 책임 | 신규 |
|---|---|---|---|
| 월 파라미터 | `server/schedule/month.ts` | `?ym=YYYY-MM` 파싱·검증, 서울 기준 오늘 | 신규 |
| 잔여치 | `server/schedule/balances.ts` | 원장 합계(현재·시점), 마감 안 된 앞 달 투영 | 신규 |
| 로더 | `server/schedule/load.ts` | DB → 월 화면 원자료(계획·칸·사용자·휴일·정산 스냅샷·잔여) | 신규 |
| 뷰 모델 | `server/schedule/view.ts` | 원자료 → 행·칸·일자 헤더·요약 카드·배지·하단 문구(순수 함수) | 신규 |
| 화면 | `app/(app)/page.tsx`, `components/schedule/*` | S3 헤더·카드·격자·빈 상태·인쇄 | 신규 |
| 개발 시드 | `server/seed/dev-schedule.ts` | 종이 2026-10(가명)을 확정 근무표·초기 원장으로 시드 | 신규 |

- 격자는 **서버 컴포넌트**로 렌더링한다. 클라이언트로 보내는 데이터가 없으므로(인쇄 버튼만 client) 역할별 DTO 누출 위험이 없다. S3에는 코멘트·휴가 사유가 들어가지 않는다.
- TanStack Query는 도입하지 않는다(2-1 문서의 "2-3에서 도입"을 2-5 신청 화면으로 미룸, §7).

## §2. 아티팩트 인덱스

| 아티팩트 | 상태 | 링크 |
|---|---|---|
| domain-entities | ✅ | [`domain-entities.md`](domain-entities.md) |
| business-rules | ✅ | [`business-rules.md`](business-rules.md) |
| business-logic-model | ✅ | [`business-logic-model.md`](business-logic-model.md) |
| frontend-components | ✅ | [`frontend-components.md`](frontend-components.md) |

## §3. 미해결 질문

없음. 2026-09-27 답변으로 해소했다(DECISIONS).
- Q1 누적 OFF 표시 → 색 없이 부호 + 설명("다음 달 반납 4" / "다음 달 2일 더 받음").
- Q2 동료 정보 공개 → 모두 공개(휴가 종류·검진 반차 포함).
- Q3 "이번달 OFF" → 정산 기준 OFF(일반·보수교육·노조교육).
- Q4 기본 달 → 이번 달. 다음 달이 확정되어 있으면 헤더에 링크.

AI가 정한 사항(READY 승인으로 확정): 휴가(LEAVE) 칩은 "휴", 연차 칩은 "연"(둘 다 #DDEFEB, 외곽선 없음). 검진 반차는 칩 오른쪽 위 점 표시. 칸의 종류(슬리핑오프·병가 등)는 마우스를 올리면 보이는 툴팁. 개발 시드에 종이 10월을 확정 근무표로 넣는다(가명).

## §4. 구현 체크리스트

- [ ] `month.ts` + 테스트(잘못된 `ym` → 이번 달, 서울 기준 오늘)
- [ ] `balances.ts` + 통합 테스트(원장 합계, 시점 합계, 마감 안 된 앞 달 투영 체인)
- [ ] `load.ts` + 통합 테스트(확정·마감·없음, 행 포함 규칙, 성능)
- [ ] `view.ts` + 단위 테스트(행 순서·강조, 칸 표시·외곽선, 일자 헤더, 카드, 우측 컬럼, 빈 상태, 하단 문구, 28/30/31일 열)
- [ ] 화면 컴포넌트 + 인쇄 CSS
- [ ] 개발 시드 `dev-schedule.ts` + 통합 테스트(멱등, 칸 341개, 누적 OFF가 종이와 일치)
- [ ] E2E: 간호사·관리자 10월 격자, 빈 달, 월 이동, 인쇄 모드

## §5. 검증 계획

- [ ] `pnpm typecheck`·`lint`·`format:check` = 0
- [ ] 단위: `view.ts`·`month.ts`
- [ ] 통합(실제 Postgres): `balances`·`load`·시드. 종이 10월 10명의 화면 누적 OFF = 종이 값
- [ ] E2E: 로그인 → `/?ym=2026-10` 격자 11행·내 줄 2번째 행·카드 5개, `›`/`‹` 이동, 근무표 없는 달 빈 상태, `emulateMedia('print')`에서 사이드바·카드 숨김
- [ ] 수동·시각: 1280×760에서 프로토타입 1c와 나란히 비교(격자 컬럼 폭·칩·색·행 높이), 인쇄 미리보기 A4 가로 1장
- [ ] 성능: 로더 + 뷰 모델 평균 < 300ms(통합 테스트)
- [ ] 공개 저장소 점검: 실명 검사 0건

## §6. NFR · 성능

standard 티어 — 응답 시간 목표만 §5에서 측정한다.

## §7. 편차 로그 — 구현 후

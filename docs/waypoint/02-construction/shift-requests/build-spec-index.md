---
build-spec: shift-requests
stage: 02-construction/05-shift-requests
status: READY
depth: standard
updated: 2026-09-27
---

# Build Spec — 2-5 근무 신청·휴가 (S4 + S5 팝오버)

## §0. 개요 & 범위

- **목표(한 줄):** 다음 달 격자 위에서 근무 신청(OFF·D·E·N 복수 선택·교육)과 휴가 신청(연차·경조사·병가·공가·특별휴가·검진)을 임시 저장 → 제출하고,
  관리자가 같은 화면에서 모든 신청을 편집하며 휴가를 승인·반려한다.
- **SoT:**
  - 화면: 핸드오프 **v4** README「S4」「S5」「S4-A 휴가 승인」, 프로토타입 `id="2a"`·`id="3b"`·`id="4a"`. turn-4 > turn-3 > turn-2
  - 도메인: [`02-domain-model.md`](../../01-inception/02-domain-model.md) §2 ShiftRequest·LeaveRequest, §3 MonthPlan·LeaveRequest 전이, §6 불변식 3·6, §8 권한(코멘트)
  - 2-2 `@duty/domain`: `ShiftRequestInputSchema`·`FAMILY_LEAVE_DAYS`·`leaveEndDate`·`defaultPlanDates`·`nextPlanStatus`·`canNurseEditRequests`·`baselineOff`
  - 2-3 이월 계산(`rowBalances`·`loadLeaveBalance`), 2-4 규칙(`eduContPerYear`·`eduUnionPerYear`)
  - 결정: [DECISIONS](../../DECISIONS.md) 2026-09-27 「2-5 근무 신청·휴가 (Q1~Q4)」
- **범위 밖:** 확정된 달 휴가의 "승인 · 대체 지정"(S9 셀 팝오버·대체 후보·대체자 알림)과 승인 취소 시 칸 복원 → 2-7. 신청을 반영한 근무 생성 → 2-6. 동료 현황 S6(2차).
- **규모/제약:** 10명 × 31일. 다른 사람의 신청은 30초마다·창 포커스 때 다시 불러온다(1-3 §2). 코멘트는 서버가 역할별로 걸러 보낸다(1-2 §8).
- **깊이 티어:** `standard` + business-logic-model·frontend-components — 신청 상태(임시·제출)·마감·휴가 검증이 로직의 핵심이고 화면은 팝오버가 복잡하다.

## §1. 분해

| 단위 | 파일 | 책임 |
|---|---|---|
| 도메인 | `packages/domain/src/requests.ts` | 신청 표시 라벨(`O/D`), 휴가 일수·종료일, 공가 사유, OFF 목표, 교육 가능 여부 |
| 스키마 | `apps/web/src/server/db/schema.ts` + 마이그레이션 | `shift_requests.submitted_at`, `leave_requests.comment`, allowed-set(`LEAVE_TYPES` + annual, `LEAVE_STATUSES` + DRAFT) |
| 달 계획 | `server/requests/plan.ts` | 신청 기간 판정, 계획 지연 생성(REQUESTING), 마감 지난 계획 REQUEST_CLOSED 전이 |
| 신청 서비스 | `server/requests/service.ts` | 근무 신청 저장·삭제(임시), 휴가 신청 저장·취소, 제출, 관리자 편집, 휴가 승인·반려 |
| 조회·DTO | `server/requests/load.ts`, `dto.ts` | 월 원자료 → 역할별 DTO(`toNurseRequestsDTO`/`toAdminRequestsDTO`) |
| 잔여 | `server/schedule/load.ts` 보강 | "예정 잔여" = 월말 예정 − 대기·승인 휴가(미확정 달) — 사이드바 카드·휴가 검증 공용 |
| 액션 | `server/requests/actions.ts` | 저장·삭제·제출·승인·반려(본인·관리자 권한 검사) |
| 화면 | `app/(app)/requests/page.tsx`, `components/requests/*` | 헤더·카드·격자·팝오버·하단 바·관리자 승인 패널, 30초 새로고침 |

## §2. 아티팩트 인덱스

| 아티팩트 | 상태 | 링크 |
|---|---|---|
| domain-entities | ✅ | [`domain-entities.md`](domain-entities.md) |
| business-rules | ✅ | [`business-rules.md`](business-rules.md) |
| business-logic-model | ✅ | [`business-logic-model.md`](business-logic-model.md) |
| frontend-components | ✅ | [`frontend-components.md`](frontend-components.md) |

## §3. 미해결 질문

없음. 2026-09-27 답변으로 해소했다(DECISIONS).
- Q1 휴가 승인 → 근무 신청 화면의 관리자 패널(핸드오프 v4 4a).
- Q5(v4) 확정된 달의 휴가 → 간호사는 신청 화면에서 ‹로 확정된 달을 열어 휴가만 신청, 관리자 패널은 인원 영향(2-2 검사기)을 보여 주고 승인 즉시 칸을 휴가로 바꾼다(문제가 있어도 경고와 함께 승인 가능). 대체 지정만 2-7.
- Q2 버튼 → 팝오버 저장은 **임시 저장**(본인만 보임), 하단 "신청 제출"을 눌러야 다른 사람·관리자에게 보인다.
- Q3 OFF 목표 → `기준 OFF − 누적 OFF + 이번 달 부여 가능 슬리핑오프`. OFF 단일 신청이 목표를 넘으면 경고(저장은 허용).
- Q4 대기 휴가 → 점선 '휴'(승인되면 채운 '휴', 반려되면 사라지고 본인에게 사유 표시). 제출된 것은 동료도 본다.

AI가 정한 사항(READY 승인으로 확정): 다음 설명은 business-rules에 있다 — 신청 기간(대상 월 전월 1일 ~ 마감일), 계획 지연 생성, 제출 뒤 수정하면 다시 임시 상태, 교육 칩 '교',
휴가 일수 계산(경조사 고정·검진 0.5·그 외 달력 일수), 월을 넘는 휴가 허용, 30초 새로고침은 TanStack Query 대신 `router.refresh()`.

## §4. 구현 체크리스트

- [ ] 도메인 `requests.ts` + 테스트
- [ ] 마이그레이션 + allowed-set
- [ ] 달 계획 지연 생성·마감 전이 + 통합 테스트
- [ ] 신청 서비스 + 통합 테스트(임시·제출·마감 잠금·관리자 편집·휴가 검증·승인·반려·취소)
- [ ] 역할별 DTO + 테스트(간호사 DTO에 남의 코멘트 본문·임시 신청이 없음)
- [ ] 예정 잔여(대기·승인 휴가 차감) + 사이드바 반영 + 통합 테스트
- [ ] 확정된 달 휴가: 신청(휴가만)·인원 영향 계산·승인 시 칸 대체(`CellEditLog` leave_approved) + 통합 테스트
- [ ] 액션(권한) + 화면(관리자 4a 패널: 접기·펼치기, 월 배지, 인원 영향, 처리 이력, 코멘트 호버 바) + 30초 새로고침
- [ ] E2E: 간호사 신청(복수 옵션·코멘트) → 임시 → 제출 → 동료 화면·관리자 화면, 휴가(경조사 종료일 자동) → 관리자 승인, 마감 뒤 잠금, 잔여 초과 차단, 확정된 10월 병가 → 인원 영향 표시 → 승인 → 근무표(S3)에 '휴'

## §5. 검증 계획

- [ ] `typecheck`·`lint`·`format:check` = 0, 단위·통합·E2E, 빌드
- [ ] 보안: 간호사 DTO 스냅샷에 남의 코멘트 없음, 다른 사람 신청 수정 액션 거부(서비스 테스트), 마감 뒤 간호사 수정 거부
- [ ] 수동·시각: 1280×760에서 2a·3b와 비교(격자·칩·팝오버)
- [ ] 실명 검사 0건

## §6. NFR · 성능

standard 티어. 신청 화면 로드 < 300ms(통합 테스트).

## §7. 편차 로그 — 구현 후

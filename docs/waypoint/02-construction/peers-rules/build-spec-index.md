---
build-spec: peers-rules
stage: 02-construction/10-peers-rules
status: READY
depth: standard
updated: 2026-10-08
---

# Build Spec — 2-10 동료 현황·규칙 안내 (S6·S7)

## §0. 개요 & 범위
- **목표(한 줄):** 자리 표시로 남은 S6 동료 현황·S7 규칙 안내를 구현한다. S2 초기 설정은 넣지 않는다(Q1).
- **SoT:** 핸드오프 v5 S6(1h)·S7(1l), 요구사항 원문(근무일정표·야간 운영·응급실 지침), 2-3 잔여 계산, 2-4 규칙 설정.
- **규모/제약:** 화면 2개, 새 테이블 없음. 둘 다 읽기 전용.
- **깊이 티어 & 사유:** `standard` — 새 엔티티는 없지만 표시 규칙(정렬·주말 쌍·태그)과 규칙 문구 원천을 정확히 고정해야 한다.

## §1. 분해

| 단위 | 책임 | 의존 | 신규/기존 |
|---|---|---|---|
| `weekendPairs(restAt, monthDates, nextHeadKnown)` (`packages/domain/src/checker/person.ts`) | 그 달 토·일 쌍의 토요일 목록과 "다음 달 1일 미정" 여부. `hasWeekendPair`가 이 함수를 쓴다 | 2-2 | 신규(추출) |
| `buildPeersView(data, rules, viewerId)` (`apps/web/src/server/peers/view.ts`) | `MonthViewData` → 표 행(R-PEER-4~9). 순수 함수 | `loadMonthView`, `signed` | 신규 |
| `PeersPage`·`PeersHeader`·`PeersTable` | 화면 | 위 | 신규 |
| `buildRulesGuide(rules, version)` (`apps/web/src/server/rules/guide.ts`) | 규칙 → 섹션 7개·항목·태그(business-rules §3). 순수 함수 | `RuleSet`, `SHIFT_TIMES`, `FAMILY_LEAVE_DAYS`, `FAMILY_REASON_LABEL`, `OFFICIAL_LEAVE_REASONS` | 신규 |
| `RulesGuidePage`·`GuideToc`·`GuideSection` | 화면 | 위 | 신규 |
| `nav-items.ts` | pending 해제 | — | 기존 수정 |

## §2. 아티팩트 인덱스
| 아티팩트 | 상태 | 링크 / N/A 사유 |
|---|---|---|
| domain-entities | N/A | 새 엔티티·테이블 없음. 표시 DTO는 frontend-components와 §1 |
| business-rules | ✅ | [`business-rules.md`](business-rules.md) |
| business-logic-model | N/A | 계산은 2-3 `loadMonthView` 재사용, 새 흐름은 §1 순수 함수 두 개 |
| frontend-components | ✅ | [`frontend-components.md`](frontend-components.md) |

## §3. 미해결 질문
없음. Q1~Q3은 DECISIONS 2026-10-08 「2-10 동료 현황·규칙 안내 (Q1~Q3)」로 이관.

AI가 정한 사항(READY 승인으로 확정): S6 행은 교대 근무자만·정렬 동률 처리(R-PEER-8)·주말 쌍 표기(R-PEER-7)·누적 OFF 색 없음(2-3 Q1 따름), S7 "안내" 태그 추가(R-GUIDE-3)와 항목 문구(business-rules §3).

## §4. 구현 체크리스트
- [ ] `weekendPairs` 추출 + 단위 테스트(쌍 여러 개, 월말 토요일·다음 달 미정, 휴가 칸)
- [ ] `buildPeersView` + 단위 테스트(수간호사 제외, 정렬·동률, 내 행, 미확정 달 빈 상태, 주말 문구 3종, 토글 꺼짐)
- [ ] S6 화면·월 이동
- [ ] `buildRulesGuide` + 단위 테스트(기본 규칙 스냅샷 수치, 규칙 값을 바꾸면 문구가 바뀜, 토글 꺼짐 → 사용 안 함, 야간 전담 켜짐/꺼짐)
- [ ] S7 화면·목차 스크롤 연동
- [ ] 메뉴 pending 해제
- [ ] E2E: 간호사 동료 현황(10행·내 행·정렬·빈 달), 규칙 안내(관리자가 최소 휴식을 바꾸면 안내 문구가 바뀜)

## §5. 검증 계획
- [ ] format·typecheck·lint 0, 단위·통합 그린
- [ ] E2E 전체 그린(연속 2회), `next build` 성공
- [ ] 시각: 1280·넓은 화면에서 S6·S7을 프로토타입과 비교(스크린샷)

## §6. NFR · 성능
N/A(standard). 두 화면 모두 서버 렌더링, S6은 근무표와 같은 조회 1회.

## §7. 편차 로그 (Deviations) — 구현 후

| SoT | 실제 구현 | 사유 |
|---|---|---|
| 원문 §10·11 "연차·잔여 나이트·이월 오프는 로그인 후 본인이 입력" / 핸드오프 S2 | S2를 만들지 않고 관리자가 S10에서 입력(기존 방식) | Q1. 다른 사람의 배정 순서에 영향을 주는 값, 일반 시스템 관행 |
| 핸드오프 S6 누적 OFF 색(양수 초록·음수 빨강) | 색 없이 부호 | 2-3 Q1 |
| 핸드오프 S7 규칙 9개 한 묶음·수치 하드코딩 | 섹션 7개, 규칙 값에서 렌더링, "안내" 태그 추가 | Q2, S11 하드코딩 금지 |

---
artifact: domain-entities
build-spec: shift-requests
status: DRAFT
updated: 2026-09-27
---

# Domain & Entities — 2-5 근무 신청·휴가

## 1. 스키마 변경 (마이그레이션 0002)

| 테이블 | 변경 | 이유 |
|---|---|---|
| `shift_requests` | `submitted_at timestamptz null` | Q2 임시 저장(null) / 제출(시각) |
| `leave_requests` | `comment text null` | 핸드오프 v2 LeaveRequest.comment |

## 2. Allowed-set 변경 (`packages/domain`)

| 이름 | 변경 |
|---|---|
| `LEAVE_TYPES` | + `annual` (연차가 휴가 흐름으로 들어옴, 핸드오프 v2) |
| `LEAVE_STATUSES` | + `DRAFT` (Q2) → `DRAFT · SUBMITTED · APPROVED · REJECTED · CANCELLED` |
| `OFFICIAL_LEAVE_REASONS` (신규) | `reserve`(예비군·민방위) · `court`(법원 등 출두) · `vote`(투표) · `disaster`(천재지변) |

## 3. 도메인 함수 (`requests.ts`)

| 함수 | 설명 |
|---|---|
| `requestLabel(options, special?)` | `['OFF','D'] → 'O/D'`, `['E'] → 'E'`, `EDU_* → '교'` |
| `leaveDays(type, start, end, reasonCode?)` | family = 사유 일수, checkup = 0.5, 그 외 = 달력 일수 |
| `leaveEnd(type, start, reasonCode?, end?)` | family = `leaveEndDate(start, 일수)`, checkup = start, 그 외 = 입력한 end(≥ start) |
| `leaveAccount(type)` | annual → annual_leave, special → special_leave, checkup → checkup, sick → sick_leave, family·official → null(한도 없음) |
| `offTarget({ baseline, offCarry, nightBank, sleepingOffPerN })` | `baseline − offCarry + floor(nightBank / sleepingOffPerN)` (월초 잔여 N만으로 확정 가능한 슬리핑오프) |

## 4. DTO (`server/requests/dto.ts`)

### `RequestsView`
| 필드 | 설명 |
|---|---|
| `year`, `month`, `plan` | 대상 월과 계획(status, requestDeadline, negotiationStart/End) |
| `editable` | 로그인 사용자가 자기 줄을 편집할 수 있는지(간호사: 신청 기간 안, 관리자: 생성 전) |
| `rows` | 교대 근무자, 나 먼저 → 순위. `{ userId, name, me, cells: RequestCellDTO[], count }` |
| `offCounts` | 날짜별 OFF 단일 신청 수(제출분) |
| `cards` | 내 신청 요약·OFF 목표·주말 통 OFF 우선 대상·병동 신청 요약 |
| `pendingLeaves` | 관리자 전용: 승인 대기 휴가 목록 |
| `unsubmitted` | 내 임시 신청 수 |

### `RequestCellDTO`
`{ date, kind: 'shift' | 'leave' | null, label, options?, special?, hasComment, comment?, draft, leave?: { id, type, reasonCode, status, startDate, endDate, days, rejectReason? } }`
- `comment`는 **본인 것 또는 관리자일 때만** 채운다. 다른 사람의 임시(`draft`) 신청은 DTO에 넣지 않는다.

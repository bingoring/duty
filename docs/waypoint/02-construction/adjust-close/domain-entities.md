# domain-entities — 2-7 근무 조정·월 마감

## §1. 편집안 (브라우저에 모았다가 한 번에 저장)

```ts
// packages/domain/src/adjust.ts
type CellEdit = {
  userId: string
  date: IsoDate
  before: { code: ShiftCode; offKind?: OffKind; leaveKind?: LeaveKind }   // 편집을 시작할 때 본 값 (충돌 검사)
  after:  { code: 'D' | 'E' | 'N' | 'S' | 'OFF'; offKind?: 'regular' | 'sleeping' }  // 관리자가 고르는 5칩 (1j)
  override?: { reason: string }           // Q2: 필수 위반을 알고도 적용 (1~200자)
  kind: 'manual' | 'swap' | 'replacement' // 맞바꾸기·대체 지정은 표시용 구분, 저장 이유는 모두 'manual'
}
```
- 한 칸에 편집이 여러 번이면 마지막 것만 남긴다(키 `userId|date`). `after`가 원래 값과 같아지면 편집을 지운다.
- 휴가 칸(AL·LEAVE·OFF special/founding)은 5칩 편집 대상이 아니다. 팝오버에서 「휴가 취소」로만 바꾼다(§3).
- OFF를 고르면 offKind는 `regular`. 슬리핑오프는 팝오버의 "슬리핑오프로" 토글(잔여 N 한도 안에서만 켜짐).

## §2. 영속성

| 테이블 | 변경 |
|---|---|
| `schedule_cells` | 저장 시 `code·offKind·leaveKind` 갱신, `source='admin'`, `editedBy`·`editedAt` |
| `cell_edit_logs` | + `note text null` — 예외 허용 사유(Q2). 편집마다 1행: `before`·`after`(jsonb), `reason` ∈ EDIT_REASONS |
| `users` | + `changes_seen_at timestamptz null` — 안내 띠를 마지막으로 확인한 시각(Q3) |
| `month_plans` | `negotiationStart`·`negotiationEnd` 변경(관리자), `status` CONFIRMED ↔ CLOSED, `closedBy`·`closedAt` |
| `month_settlements` | 마감 시 인당 1행(2-2 `settleMonth` 결과), 마감 취소 시 삭제 |
| `balance_entries` | 마감 시 `reason='month_settlement'`, `refYear/refMonth`=대상 월, `refId`=plan id. 취소 시 `reason='settlement_reversed'`(부호 반대, `reverseEntries`) |

allowed-set 추가(확장 시 추가만): `EDIT_REASONS` + `'leave_cancelled'`, `BALANCE_REASONS` + `'settlement_reversed'`.

## §3. 휴가 칸 복원 (Q4)

`leave_requests` APPROVED → CANCELLED(관리자, 확정·미마감 달). 날짜마다:
1. 그 휴가의 `cell_edit_logs(reason='leave_approved')` 중 최신 행을 찾는다.
2. 현재 칸이 그 행의 `after`와 같으면 `before`로 되돌리고 `reason='leave_cancelled'` 이력을 남긴다. `source`는 `admin`.
3. 다르면(그 뒤 다시 고침) 건너뛰고 결과에 "M/D는 승인 뒤 다시 바뀌어 되돌리지 않았습니다"를 담는다.
4. 이력이 없는 날짜(2-6 생성 때 고정 칸으로 들어간 휴가)는 `OFF regular`로 두고 같은 안내를 한다.

## §4. 화면 원자료 (`server/adjust/load.ts`)

```ts
AdjustRaw = {
  year, month, today, viewerRole
  plan: { id, status, negotiationStart, negotiationEnd, requestDeadline, closedAt } | null
  grid: ScheduleView                  // 2-3 buildScheduleView (관리자: 내 줄 강조 없음, 수간호사 첫 행)
  checkInput: ScheduleInput | null    // 관리자만. 월초 잔여를 채운 검사 입력(2-6 fillProfiles 재사용) — 브라우저 검사용
  requests: Record<'userId|date', { label: string; comment: string | null }>   // 관리자만 (코멘트 권한 1-2 §8)
  leaveCells: Record<'userId|date', { leaveId: string; kindLabel: string; range: string }>  // 관리자만
  names: Record<userId, { name: string; kTass: boolean; rotation: Rotation }>
  close: { can: boolean; reason: string | null; canReopen: boolean }             // §business-rules R-CLOSE
  focus: { date: IsoDate; shift?: 'D'|'E'|'N'; leaveId?: string } | null         // 4a 대체 지정에서 넘어올 때
}
```

## §5. 안내 (Q3)

```ts
Notice = { date: IsoDate; before: string; after: string; by: string; at: 'M/D HH:mm'; ym: 'YYYY-MM' }
```
`cell_edit_logs`에서 `userId = 나`, `editedBy ≠ 나`, `editedAt > users.changes_seen_at`(없으면 최근 14일) 행. 같은 칸이 여러 번 바뀌면 최신 하나(처음 before → 마지막 after).
최대 5줄 + "외 N건". 「확인」 = `changes_seen_at = now()`.

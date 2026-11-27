# domain-entities — 2-8 근무 교환 요청

## §1. 테이블 (마이그레이션)

```ts
swap_requests = {
  id: uuid pk
  monthPlanId: uuid → month_plans
  date: date                     // 한 요청 = 한 날짜 (Q2)
  requesterId: uuid → users
  comment: text null             // 당사자에게만 보임 (최대 500자)
  status: text                   // SWAP_STATUSES
  closedReason: text null        // 무효·만료 사유 문구
  createdAt, closedAt: timestamptz null
}
swap_request_items = {
  requestId: uuid → swap_requests (cascade)
  userId: uuid → users
  before: jsonb { code, offKind? }   // 요청 당시 칸 (반영 전 재확인)
  after:  jsonb { code, offKind? }
  response: text                     // SWAP_RESPONSES — 요청자는 만들 때 ACCEPTED
  respondedAt: timestamptz null
  pk (requestId, userId)
}
```
allowed-set(확장 시 추가만): `SWAP_STATUSES = ['PENDING','APPLIED','REJECTED','CANCELLED','EXPIRED','INVALID']`, `SWAP_RESPONSES = ['PENDING','ACCEPTED','REJECTED']`.

## §2. 상태 전이

```
PENDING ──(당사자 전원 ACCEPTED + 재검사 통과)──▶ APPLIED   칸 반영, cell_edit_logs reason 'swap'
PENDING ──(누군가 REJECTED)──────────────────▶ REJECTED
PENDING ──(요청자 철회)──────────────────────▶ CANCELLED
PENDING ──(협의 기간 끝, 조회 때 판정)─────────▶ EXPIRED
PENDING ──(걸린 칸이 바뀜 / 마지막 수락 때 재검사 실패)──▶ INVALID  closedReason
```
끝난 상태(APPLIED·REJECTED·CANCELLED·EXPIRED·INVALID)는 바뀌지 않는다.

## §3. 도메인 (`packages/domain/src/swap.ts`)

```ts
type SwapItem = { userId: string; before: SwapCell; after: SwapCell }
type SwapCell = { code: 'D' | 'E' | 'N' | 'OFF' }            // OFF는 regular만
swappable(cell: GridCell | undefined): boolean               // D·E·N·OFF(regular), 휴가·교육·슬리핑·S 제외
sameCounts(items): boolean                                    // before·after 코드 다중집합이 같다 (그날 D/E/N 개수 유지)
swapToEdits(date, items): CellEdit[]                          // kind 'swap'
inNegotiation(plan, today): boolean                           // negotiationStart ≤ today ≤ negotiationEnd
daysLeft(plan, today): number                                 // 배지 "N일 남음"
```

## §4. 화면 DTO (`server/swaps/load.ts`)

```ts
SwapView = {
  window: { open: boolean; label: string }          // "협의 기간 10/16 – 10/20 · 3일 남음" | "협의 기간 아님 (10/16 – 10/20)"
  selectable: string[]                              // 교대 근무자 id (수간호사 제외)
  checkInput: ScheduleInput                         // 브라우저 검사용 (2-7과 같은 월초 잔여 채움)
  received: SwapCard[]                              // 내가 응답해야 하는 PENDING (+ 최근 끝난 것 5)
  sent: SwapCard[]                                  // 내가 보낸 것 (최근 20)
  pendingByCell: Record<'userId|date', string[]>    // 대기 요청 id (겹침 경고)
}
SwapCard = {
  id, date, title: '11/22 (일) · 2인 교환', when: 'M/D HH:mm', from: string,
  detail: '임소라 D→OFF · 박서연 OFF→D', comment: string | null,
  people: { name, response: 'PENDING'|'ACCEPTED'|'REJECTED' }[],
  status, statusLabel: '대기' | '완료 · 반영됨' | '거절됨' | '철회함' | '만료' | '무효 · {사유}',
  canRespond: boolean, canCancel: boolean
}
```
관리자: `received=[]`, `sent`에 이 달 모든 요청(읽기 전용).
